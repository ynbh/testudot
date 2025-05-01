import { parse } from "node-html-parser";
import fs from "fs";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import path from "path";
import inquirer from "inquirer";
import dotenv from "dotenv";
import chalk from "chalk";

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

function getEmailsForCourse(courseName: string): string[] {
  console.log(chalk.gray(`getting emails for course: ${courseName}`));
  const emails = Object.entries(USER_COURSE_MAP)
    .filter(([_email, courses]) => courses.includes(courseName))
    .map(([email]) => email);
  console.log(chalk.gray(`found emails: ${emails.join(", ")}`));
  return emails;
}

const getTestudoCourseHTML = async (courseName: string) => {
  console.log(chalk.blue(`fetching html for ${courseName.toLowerCase()}`));
  const req = await fetch(
    `https://app.testudo.umd.edu/soc/search?courseId=${courseName}&sectionId=&termId=202508&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`,
    { headers: { "User-Agent": "testudot/0.0.0" } }
  );
  const text = await req.text();
  console.log(chalk.blue(`fetched html for ${courseName.toLowerCase()}`));
  return text;
};

const parseTestudoCourseHTML = async (html: string) => {
  console.log(chalk.blue(`parsing html content`));
  return parse(html);
};

const scrapeCourseData = async (courseName: string) => {
  console.log(chalk.green(`scraping data for ${courseName.toLowerCase()}`));
  const html = await getTestudoCourseHTML(courseName);
  const classes = await parseTestudoCourseHTML(html);

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
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(chalk.yellow(`writing data to file: ${fileName}`));
  fs.writeFileSync(fileName, JSON.stringify(sections, null, 2));
  console.log(chalk.yellow(`wrote data file for ${courseName.toLowerCase()}`));

  return sections;
};

async function monitorCourse(courseName: string) {
  console.log(chalk.magenta(`monitoring course: ${courseName.toLowerCase()}`));
  try {
    console.log(
      chalk.magenta(`retrieving existing data for ${courseName.toLowerCase()}`)
    );
    const existingData = await prisma.course.findMany({
      where: { course_name: courseName },
    });
    console.log(chalk.magenta(`existing records: ${existingData.length}`));

    const scrapedData = await scrapeCourseData(courseName);
    console.log(
      chalk.magenta(`comparing data for ${courseName.toLowerCase()}`)
    );
    const changes = compareData(existingData, scrapedData);
    console.log(
      chalk.magenta(
        `found ${changes.length} changes for ${courseName.toLowerCase()}`
      )
    );

    if (changes.length > 0) {
      await sendNotification(changes, courseName);
    }

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
      chalk.magenta(`completed monitoring for ${courseName.toLowerCase()}`)
    );
  } catch (err) {
    console.log(chalk.red(`monitoring error: ${err.message || err}`));
  }
}

function compareData(existingData: any[], newData: CourseSection[]) {
  console.log(chalk.cyan(`comparing existing and new data`));
  const changes: any[] = [];
  for (const newSection of newData) {
    const existingSection = existingData.find(
      (section) => section.section_id === newSection.section_id
    );
    if (!existingSection) {
      changes.push({ type: "new_section", data: newSection });
    } else if (existingSection.open_seats !== newSection.open_seats) {
      changes.push({
        type: "seats_changed",
        sectionId: newSection.section_id,
        from: existingSection.open_seats,
        to: newSection.open_seats,
      });
    }
  }

  for (const existingSection of existingData) {
    const stillExists = newData.some(
      (section) => section.section_id === existingSection.section_id
    );
    if (!stillExists && existingSection.removed !== true) {
      changes.push({
        type: "section_removed",
        sectionId: existingSection.section_id,
        custom_course_id: existingSection.custom_course_id,
      });
    }
  }

  console.log(
    chalk.cyan(`comparison complete: ${changes.length} total changes`)
  );
  return changes;
}

// sends notification about changes
async function sendNotification(changes, courseName: string) {
  console.log(chalk.green(`sending notification for ${courseName}`));

  const changeHtml = changes
    .map((c) => {
      switch (c.type) {
        case "seats_changed":
          return `
            <div style="margin-bottom:16px;padding:16px;background:#161d2e;border-radius:6px;">
              <div style="font-size:14px;color:#4299e1;">
                seats changed · ${c.sectionId} · ${c.instructor.toLowerCase()}
              </div>
              <div style="font-size:14px;color:#a0aec0;">
                ${c.from} → ${c.to}
              </div>
            </div>`;

        case "new_section":
          return `
            <div style="margin-bottom:16px;padding:16px;background:#162d21;border-radius:6px;">
              <div style="font-size:14px;color:#48bb78;">
                new section · ${c.data.section_id}
              </div>
              <div style="font-size:14px;color:#a0aec0;margin-bottom:4px;">
                instructor: ${c.data.instructor.toLowerCase()}
              </div>
              <div style="font-size:14px;color:#a0aec0;">
                ${c.data.open_seats}/${c.data.total_seats} seats${
                  c.data.waitlist_count
                    ? ` · ${c.data.waitlist_count} waitlisted`
                    : ""
                }
              </div>
            </div>`;

        case "section_removed":
          return `
            <div style="margin-bottom:16px;padding:16px;background:#2a1a1a;border-radius:6px;">
              <div style="font-size:14px;color:#f56565;">
                section removed · ${c.sectionId}
              </div>
            </div>`;

        default:
          return "";
      }
    })
    .join("");

  const emailBody = `
    <html>
    <body style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;background:#0f141e;color:#e2e8f0;padding:20px 0;">
      <div style="padding:20px;">
        <h1 style="margin:0 0 20px;font-size:18px;font-weight:500;">${courseName}</h1>
        ${changeHtml}
        <div style="font-size:12px;color:#4a5568;margin-top:20px;">course monitoring</div>
      </div>
    </body>
    </html>`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: getEmailsForCourse(courseName),
    subject: `changes detected in ${courseName.toLowerCase()} sections`,
    html: emailBody,
  });

  console.log(chalk.green(`notification sent for ${courseName}`));
}


async function getCoursesFromUser() {
  console.log(chalk.gray(`prompting user for course list`));
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "courses",
      message: "enter course names separated by commas:",
      filter: (input) => input.split(",").map((item) => item.trim()),
    },
  ]);
  console.log(
    chalk.gray(`user entered courses: ${answers.courses.join(", ")}`)
  );
  return answers.courses;
}

const main = async () => {
  console.log(chalk.green(`starting course monitor main`));
  const courseNames = Array.from(
    new Set(Object.values(USER_COURSE_MAP).flat())
  );
  console.log(chalk.green(`monitoring courses: ${courseNames.join(", ")}`));

  await Promise.all(courseNames.map(monitorCourse));

  cron.schedule("*/15 * * * *", async () => {
    console.log(chalk.green(`cron job start: monitoring all courses`));
    await Promise.all(courseNames.map(monitorCourse));
    console.log(chalk.green(`cron job done`));
  });

  console.log(chalk.green(`setup complete`));
};

main().catch((err) =>
  console.log(chalk.red(`application error: ${err.message || err}`))
);
