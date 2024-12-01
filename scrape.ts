import puppeteer, { Browser } from "puppeteer";
import { parse } from "node-html-parser";
import fs from "fs";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

import inquirer from "inquirer"; // For CLI input

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE
const supabase = createClient(supabaseUrl, supabaseKey);

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
  created_at: Date;
  custom_course_id: `${string}-${string}`;
}

const launchCoursePage = async (browser: Browser, courseName: string) => {
  console.log(`Launching browser for course: ${courseName}`); // log

  const page = await browser.newPage();

  await page.goto(
    `https://app.testudo.umd.edu/soc/search?courseId=${courseName}&sectionId=&termId=202501&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`
  );

  return page;
};

// scrapes course data
const scrapeCourseData = async (courseName: string) => {
  console.log("starting to scrape data for", courseName);
  const browser = await puppeteer.launch({ headless: true });

  const page = await launchCoursePage(browser, courseName);

  const selector = ".sections-container";
  await page.waitForSelector(selector);
  console.log("found sections container for", courseName);

  const divContent = await page.$eval(selector, (element) => element.outerHTML);
  const classes = parse(divContent);

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
    } as CourseSection;
  });

  // save extracted data as json
  const fileName = `local/sections-${courseName}.json`;
  fs.writeFileSync(fileName, JSON.stringify(sections, null, 2));
  console.log("data saved to", fileName);

  await browser.close();

  return sections;
};

// monitors course
async function monitorCourse(courseName: string) {
  try {
    console.log("monitoring course:", courseName);

    // scrape course data
    const scrapedData = await scrapeCourseData(courseName);

    // fetch existing data
    const { data: existingData, error: fetchError } = await supabase
      .from("courses")
      .select("*")
      .eq("course_name", courseName);

    if (fetchError) {
      console.error("fetch error:", fetchError);
      return;
    }

    // compare data for changes
    const changes = compareData(existingData, scrapedData);

    if (changes.length > 0) {
      console.log("detected changes for", courseName);
      await sendNotification(changes, courseName);
    } else {
      console.log("no changes detected for", courseName);
      return;
    }

    // update the database with new data
    const p = await Promise.all(
      scrapedData.map(async (section) => {
        const { error } = await supabase.from("courses").upsert({
          course_name: courseName,
          created_at: section.created_at,
          section_id: section.section_id,
          instructor: section.instructor,
          total_seats: section.total_seats,
          open_seats: section.open_seats,
          waitlist_count: section.waitlist_count,
          class_times: JSON.stringify(section.class_times),
          last_updated: new Date().toISOString(),
          custom_course_id: `${courseName}-${section.section_id}`,
        });
        console.log("ERROR: ", error);
      })
    );
    console.log("database updated for", courseName);
  } catch (error) {
    console.error("monitoring error:", error);
  }
}

// compares data for changes
function compareData(existingData, newData: CourseSection[]) {
  let changes: any[] = [];

  for (const newSection of newData) {
    const existingSection = existingData.find(
      (section) => section.section_id === newSection.section_id
    );

    if (!existingSection) {
      changes.push({
        type: "new_section",
        data: newSection,
      });
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
    if (
      !newData.some(
        (section) => section.section_id === existingSection.section_id
      )
    ) {
      changes.push({
        type: "section_removed",
        sectionId: existingSection.section_id,
      });
    }
  }

  return changes;
}

// sends notification about changes
async function sendNotification(changes, courseName: string) {
  console.log("sending notification for", courseName);

  // Start the HTML email body with improved styling
  let emailBody = `
      <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 8px;">
          <h2 style="color: #2e6c80; border-bottom: 2px solid #2e6c80; padding-bottom: 10px;">
            Course Updates for ${courseName}
          </h2>
          
          <p>Hello,</p>
          
          <p>We have detected some updates for the <strong>${courseName}</strong> course sections. Below are the details of the changes:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            ${changes
              .map((change) => {
                switch (change.type) {
                  case "seats_changed":
                    return `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                      <td style="padding: 10px; background-color: #f9f9f9;">
                        <strong>🔢 SEATS CHANGED</strong><br>
                        <strong>Section ID:</strong> ${change.sectionId}<br>
                        <strong>Open Seats:</strong> ${change.from} → ${change.to}
                      </td>
                    </tr>`;

                  case "new_section":
                    return `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                      <td style="padding: 10px; background-color: #f9f9f9;">
                        <strong>✨ NEW SECTION</strong><br>
                        <strong>Section ID:</strong> ${
                          change.data.section_id
                        }<br>
                        <strong>Instructor:</strong> ${
                          change.data.instructor
                        }<br>
                        <strong>Total Seats:</strong> ${
                          change.data.total_seats
                        }<br>
                        <strong>Open Seats:</strong> ${
                          change.data.open_seats
                        }<br>
                        <strong>Waitlist Count:</strong> ${
                          change.data.waitlist_count
                        }<br>
                        <strong>Class Schedule:</strong>
                        <table style="width: 100%; margin-top: 5px; border-collapse: collapse;">
                          <thead>
                            <tr style="background-color: #e0e0e0;">
                              <th style="padding: 5px; border: 1px solid #ccc; text-align: left;">Day(s)</th>
                              <th style="padding: 5px; border: 1px solid #ccc; text-align: left;">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${change.data.class_times
                              .map(
                                (time) => `
                              <tr>
                                <td style="padding: 5px; border: 1px solid #e0e0e0;">
                                  ${(time.days)}
                                </td>
                                <td style="padding: 5px; border: 1px solid #e0e0e0;">
                                  ${formatTime(time.startTime)} - ${formatTime(
                                  time.endTime
                                )}
                                </td>
                              </tr>
                            `
                              )
                              .join("")}
                          </tbody>
                        </table>
                      </td>
                    </tr>`;

                  case "section_removed":
                    return `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                      <td style="padding: 10px; background-color: #f9f9f9;">
                        <strong>❌ SECTION REMOVED</strong><br>
                        <strong>Section ID:</strong> ${change.sectionId}
                      </td>
                    </tr>`;

                  default:
                    return "";
                }
              })
              .join("")}
          </table>
          
          <p style="font-style: italic; color: #666;">
            Stay informed about your course sections with our monitoring service.
          </p>
          
          <p style="color: #666;">
            Best regards,<br>
            Course Monitoring Bot
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 10px; font-size: 0.8em; color: #888;">
          © 2024 Course Monitoring Service
        </div>
      </body>
      </html>`;



  // Utility function to format time
  function formatTime(time: string): string {
    // Assumes time is in 24-hour format like '14:30'
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const period = hour >= 12 ? "PM" : "AM";
    const formattedHour = hour % 12 || 12;
    return `${formattedHour}:${minutes} ${period}`;
  }

  // Send the email with HTML content
  await transporter.sendMail({
    from: "monkey.fwiw@gmail.com",
    to: "y8bhat@gmail.com",
    subject: `🔔 Changes Detected in ${courseName} Sections!`,
    html: emailBody,
  });

  console.log("notification sent for", courseName);
}

async function getCoursesFromUser() {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "courses",
      message: "Enter course names separated by commas:",
      filter: (input) => input.split(",").map((item) => item.trim()),
    },
  ]);
  return answers.courses;
}

// Function to monitor all courses
const monitorAllCourses = async (courseNames: string[]) => {
  console.log("starting immediate monitoring...");
  await Promise.all(courseNames.map(async (name) => await monitorCourse(name)));
  console.log("immediate monitoring complete. scheduling next runs...");
};

// Main function to run monitoring and set up cron
const main = async () => {
  const courseNames = await getCoursesFromUser(); // Get course names from user
  monitorAllCourses(courseNames); // Monitor immediately

  // Set up cron job to monitor every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("cron job triggered...");
    await monitorAllCourses(courseNames);
  });
};

main();
