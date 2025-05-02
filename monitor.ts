import { parse } from "node-html-parser";
import fs from "fs";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import path from "path";
import inquirer from "inquirer";
import dotenv from "dotenv";
import chalk from "chalk";
import { getMappings } from "./monitor-util";

dotenv.config();

const prisma = new PrismaClient();

const USER_COURSE_MAP = {
  "y8bhat@gmail.com": ["CMSC420", "CMSC430", "CMSC351"],
  "marc16@umd.edu": ["CMSC351"],
};

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

interface CourseSection {
  course_name: string;
  section_id: string;
  instructor: string;
  total_seats: number;
  open_seats: number;
  waitlist_count: number;
  class_times: {
    days: string;
    startTime: string;
    endTime: string;
  }[];
  created_at?: Date;
  custom_course_id: `${string}-${string}`;
}

export function getEmailsForCourse(courseName: string): string[] {
  console.log(chalk.gray(`getting emails for course: ${courseName}`));

  // load the latest email→courses mappings from disk
  const mappings = getMappings();   // { [email: string]: string[] }
  console.log(chalk.gray(`⟶ loaded mappings from disk`));

  // collect all emails where their courses array includes courseName
  const emails = Object.entries(mappings)
    .filter(([_email, courses]) => courses.includes(courseName))
    .map(([email]) => email);

  console.log(chalk.gray(`found emails: ${emails.join(', ')}`));
  console.log(chalk.gray(`⟵ completed email lookup for ${courseName}`));
  return emails;
}

const getTestudoCourseHTML = async (courseName: string) => {
  console.log(chalk.blue(`fetching html for ${courseName.toLowerCase()}`));
  console.log(chalk.blue(`⟶ sending request to testudo API`));
  const req = await fetch(
    `https://app.testudo.umd.edu/soc/search?courseId=${courseName}&sectionId=&termId=202508&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`,
    { headers: { "User-Agent": "testudot/0.0.0" } }
  );
  console.log(chalk.blue(`⟶ received response with status: ${req.status}`));
  const text = await req.text();
  console.log(chalk.blue(`⟵ fetched html for ${courseName.toLowerCase()} (${text.length} bytes)`));
  return text;
};

const parseTestudoCourseHTML = async (html: string) => {
  console.log(chalk.blue(`parsing html content`));
  console.log(chalk.blue(`⟶ beginning html parsing (${html.length} bytes)`));
  const result = parse(html);
  console.log(chalk.blue(`⟵ parsing complete`));
  return result;
};

const scrapeCourseData = async (courseName: string) => {
  console.log(chalk.green(`scraping data for ${courseName.toLowerCase()}`));
  console.log(chalk.green(`⟶ beginning scrape process`));
  
  const html = await getTestudoCourseHTML(courseName);
  console.log(chalk.green(`⟶ received html, parsing sections`));
  
  const classes = await parseTestudoCourseHTML(html);

  console.log(chalk.green(`⟶ extracting section data from DOM`));
  const sections = classes.querySelectorAll(".section").map((section) => {
    const section_id =
      section.querySelector(".section-id")?.textContent.trim() || "";
    const instructor =
      section.querySelector(".section-instructor")?.textContent.trim() || "";
    const totalSeats =
      section.querySelector(".total-seats-count")?.textContent.trim() || "0";
    const openSeats =
      section.querySelector(".open-seats-count")?.textContent.trim() || "0";
    const waitlistCount =
      section.querySelector(".waitlist-count")?.textContent.trim() || "0";
    const class_times = section
      .querySelectorAll(".section-day-time-group")
      .map((timeGroup) => ({
        days:
          timeGroup.querySelector(".section-days")?.textContent.trim() || "",
        startTime:
          timeGroup.querySelector(".class-start-time")?.textContent.trim() ||
          "",
        endTime:
          timeGroup.querySelector(".class-end-time")?.textContent.trim() || "",
      }));

    return {
      course_name: courseName,
      section_id,
      instructor,
      total_seats: parseInt(totalSeats),
      open_seats: parseInt(openSeats),
      waitlist_count: parseInt(waitlistCount),
      class_times,
      custom_course_id: `${courseName}-${section_id}`,
    };
  });

  console.log(
    chalk.green(
      `found ${sections.length} sections for ${courseName.toLowerCase()}`
    )
  );

  const fileName = `local/sections-${courseName}.json`;
  const dir = path.dirname(fileName);
  if (!fs.existsSync(dir)) {
    console.log(chalk.yellow(`creating directory: ${dir}`));
    console.log(chalk.yellow(`⟶ directory created successfully`));
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(chalk.yellow(`writing data to file: ${fileName}`));
  console.log(chalk.yellow(`⟶ serializing ${sections.length} sections to JSON`));
  fs.writeFileSync(fileName, JSON.stringify(sections, null, 2));
  console.log(chalk.yellow(`⟵ wrote data file for ${courseName.toLowerCase()} (${sections.length} sections)`));

  return sections;
};

export async function monitorCourse(courseName: string) {
  console.log(chalk.magenta(`monitoring course: ${courseName.toLowerCase()}`));
  console.log(chalk.magenta(`⟶ beginning monitoring cycle`));
  
  try {
    console.log(
      chalk.magenta(`retrieving existing data for ${courseName.toLowerCase()}`)
    );
    console.log(chalk.magenta(`⟶ querying database for existing sections`));
    
    const existingData = await prisma.course.findMany({
      where: { course_name: courseName },
    });
    console.log(chalk.magenta(`existing records: ${existingData.length}`));
    console.log(chalk.magenta(`⟶ fetching new data from testudo`));

    const scrapedData = await scrapeCourseData(courseName);
    console.log(
      chalk.magenta(`comparing data for ${courseName.toLowerCase()}`)
    );
    console.log(chalk.magenta(`⟶ checking for changes between data sets`));
    
    const changes = compareData(existingData, scrapedData);
    console.log(
      chalk.magenta(
        `found ${changes.length} changes for ${courseName.toLowerCase()}`
      )
    );

    if (changes.length > 0) {
      console.log(chalk.magenta(`⟶ changes detected, sending notifications`));
      await sendNotification(changes, courseName);
      console.log(chalk.magenta(`⟵ notifications sent successfully`));
    } else {
      console.log(chalk.magenta(`⟶ no changes detected, skipping notifications`));
    }

    console.log(chalk.magenta(`⟶ updating database with latest section data`));
    for (const section of scrapedData) {
      console.log(
        chalk.magenta(
          `upserting section ${section.custom_course_id.toLowerCase()}`
        )
      );
      await prisma.course.upsert({
        where: { custom_course_id: section.custom_course_id },
        update: { ...section, last_updated: new Date(), removed: false },
        create: { ...section, last_updated: new Date(), removed: false },
      });
    }

    console.log(
      chalk.magenta(`⟵ completed monitoring for ${courseName.toLowerCase()}`)
    );
  } catch (err) {
    console.log(chalk.red(`monitoring error: ${err.message || err}`));
    console.log(chalk.red(`⟶ stack trace: ${err.stack || 'no stack trace available'}`));
    console.log(chalk.red(`⟵ monitoring failed for ${courseName.toLowerCase()}`));
  }
}

function compareData(existingData: any[], newData: CourseSection[]) {
  console.log(chalk.cyan(`comparing existing and new data`));
  console.log(chalk.cyan(`⟶ existing sections: ${existingData.length}, new sections: ${newData.length}`));
  
  const changes: any[] = [];
  
  console.log(chalk.cyan(`⟶ checking for new sections and seat changes`));
  for (const newSection of newData) {
    const existingSection = existingData.find(
      (section) => section.section_id === newSection.section_id
    );
    if (!existingSection) {
      console.log(chalk.cyan(`  ⟶ found new section: ${newSection.section_id}`));
      changes.push({ type: "new_section", data: newSection });
    } else if (existingSection.open_seats !== newSection.open_seats) {
      console.log(chalk.cyan(`  ⟶ seats changed for section ${newSection.section_id}: ${existingSection.open_seats} → ${newSection.open_seats}`));
      changes.push({
        type: "seats_changed",
        sectionId: newSection.section_id,
        from: existingSection.open_seats,
        to: newSection.open_seats,
        instructor:newSection.instructor,
      });
    }
  }

  console.log(chalk.cyan(`⟶ checking for removed sections`));
  for (const existingSection of existingData) {
    const stillExists = newData.some(
      (section) => section.section_id === existingSection.section_id
    );
    if (!stillExists && existingSection.removed !== true) {
      console.log(chalk.cyan(`  ⟶ section removed: ${existingSection.section_id}`));
      changes.push({
        type: "section_removed",
        sectionId: existingSection.section_id,
        custom_course_id: existingSection.custom_course_id,
      });
    }
  }

  console.log(
    chalk.cyan(`⟵ comparison complete: ${changes.length} total changes`)
  );
  return changes;
}

async function sendNotification(changes, courseName) {
  console.log(chalk.green(`sending notification for ${courseName}`));
  console.log(chalk.green(`⟶ generating email content for ${changes.length} changes`));

  const changeHtml = changes.map((c) => {
    switch (c.type) {
      case "new_section":
        return `
          <div style="
            background: #000;
            color: #fff;
            font-family: 'Inter', sans-serif;
            padding: 16px;
            margin-bottom: 16px;
            border-left: 4px solid #48bb78;
            border-radius: 4px;
          ">
            <div style="font-size: 14px; font-weight: 500;">
              new section · ${c.data.section_id}
            </div>
            <div style="font-size: 12px; margin: 4px 0;">
              instructor: ${c.data.instructor.toLowerCase()}
            </div>
            <div style="font-size: 12px;">
              ${c.data.open_seats}/${c.data.total_seats} seats${c.data.waitlist_count ? ` · ${c.data.waitlist_count} waitlisted` : ""}
            </div>
          </div>`;

      case "seats_changed":
        return `
          <div style="
            position: relative;
            background: #000;
            color: #fff;
            font-family: 'Inter', sans-serif;
            padding: 16px;
            margin-bottom: 16px;
            border-left: 4px solid #f56565;
            border-radius: 4px;
          ">
            <span style="
              position: absolute;
              top: 8px;
              right: 8px;
              background: #f56565;
              color: #fff;
              font-size: 10px;
              font-weight: bold;
              padding: 2px 6px;
              border-radius: 2px;
            ">URGENT</span>
            <div style="font-size: 14px; font-weight: 500;">
              seats changed · ${c.sectionId}
            </div>
            <div style="font-size: 12px; margin: 4px 0;">
              instructor: ${c.instructor.toLowerCase()}
            </div>
            <div style="font-size: 12px;">
              ${c.from} → ${c.to}
            </div>
          </div>`;

      case "section_removed":
        return `
          <div style="
            background: #000;
            color: #fff;
            font-family: 'Inter', sans-serif;
            padding: 16px;
            margin-bottom: 16px;
            border-left: 4px solid #f56565;
            border-radius: 4px;
          ">
            <div style="font-size: 14px; font-weight: 500;">
              section removed · ${c.sectionId}
            </div>
          </div>`;

      default:
        return "";
    }
  }).join("");

  const emailBody = `
    <html>
      <body style="
        font-family: 'Inter', sans-serif;
        background: #000;
        color: #fff;
        margin: 0;
        padding: 20px 0;
      ">
        <div style="max-width: 600px; margin: 0 auto; padding: 0 20px;">
          <h1 style="font-size: 18px; margin-bottom: 20px;">
            ${courseName}
          </h1>
          ${changeHtml}
          <div style="font-size: 12px; color: #888; margin-top: 20px;">
            course monitoring
          </div>
        </div>
      </body>
    </html>`;

  console.log(chalk.green(`⟶ retrieving recipient emails`));
  const recipients = getEmailsForCourse(courseName);
  console.log(chalk.green(`⟶ sending email to ${recipients.length} recipients`));

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: recipients,
    subject: `changes detected in ${courseName.toLowerCase()} sections`,
    html: emailBody,
  });

  console.log(chalk.green(`⟵ notification sent for ${courseName}`));
}




// const main = async () => {
//   console.log(chalk.green(`>> starting course monitor`));
//   const courseNames = Array.from(new Set(Object.values(USER_COURSE_MAP).flat()));
//   console.log(chalk.green(`-- monitoring: ${courseNames.join(", ")}`));

//   await Promise.all(courseNames.map(monitorCourse));

//   cron.schedule("*/15 * * * *", async () => {
//     console.log(chalk.green(`>> cron: checking again`));
//     await Promise.all(courseNames.map(monitorCourse));
//     console.log(chalk.green(`-- cron: done`));
//   });
// };

// main().catch((err) =>
//   console.log(chalk.bgRed.white(`!! application error: ${err.message || err}`))
// );
