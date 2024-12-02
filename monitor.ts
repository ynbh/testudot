import puppeteer, { Browser } from "puppeteer";
import { parse } from "node-html-parser";
import fs from "fs";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

import inquirer from "inquirer"; // For CLI input

import dotenv from 'dotenv'

dotenv.config()


// const supabaseUrl = process.env.SUPABASE_URL as string;
// const supabaseKey = process.env.SUPABASE_SERVICE_ROLE as string
// const supabase = createClient(supabaseUrl, supabaseKey);

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

const openDatabase = async () => {
  return await open({
    filename: './course_monitor.db',
    driver: sqlite3.Database
  });
};

// Initialize database with necessary tables
const initializeDatabase = async () => {
  const db = await openDatabase();
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_name TEXT,
      section_id TEXT,
      instructor TEXT,
      total_seats INTEGER,
      open_seats INTEGER,
      waitlist_count INTEGER,
      class_times TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      custom_course_id TEXT UNIQUE
    )
  `);

  return db;
};

const getTestudoCourseHTML = async(courseName: string) => {
  const req = await fetch(`https://app.testudo.umd.edu/soc/search?courseId=${courseName}&sectionId=&termId=202501&_openSectionsOnly=on&creditCompare=&credits=&courseLevelFilter=ALL&instructor=&_facetoface=on&_blended=on&_online=on&courseStartCompare=&courseStartHour=&courseStartMin=&courseStartAM=&courseEndHour=&courseEndMin=&courseEndAM=&teachingCenter=ALL&_classDay1=on&_classDay2=on&_classDay3=on&_classDay4=on&_classDay5=on`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "max-age=0",
      "priority": "u=0, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "cookie": "JSESSIONID=E1BF62D35A5C0BA8583315BA0799713D; _ga_26KY7YZR70=GS1.1.1699823535.2.0.1699823535.0.0.0; _ga=GA1.3.239578705.1699654926; nmstat=84e4bba9-0213-fc21-27a4-7e25f5ed8bb6; _ga_9W00B8Y6D6=GS1.1.1702360504.2.0.1702360504.0.0.0; _ga_FWRTZ8V96T=GS1.1.1702416504.2.0.1702416504.60.0.0; _hjSessionUser_2558111=eyJpZCI6IjE5MzhkMWU1LTQwYTQtNWY4My04NTQ4LWVjYWZlNmFmMzJmZCIsImNyZWF0ZWQiOjE3MDIzNDQ2MzEyMjYsImV4aXN0aW5nIjp0cnVlfQ==; _ga_0ME57WCM7H=GS1.1.1702514387.3.0.1702514395.52.0.0; _ga_6RJ22ZEGTP=GS1.1.1702516135.1.1.1702516144.0.0.0; _ga_0HWJZKFYZR=GS1.1.1702579495.8.0.1702579497.0.0.0; _ga=GA1.2.239578705.1699654926; _ga_E3TLPTPH8G=GS1.2.1702598269.3.1.1702598272.0.0.0; _ga_E9M33B2469=GS1.1.1702608386.4.0.1702608386.0.0.0; visid_incap_2811896=0MSvot8VTdWilqwsBOmmV8aSvmUAAAAAQUIPAAAAAAD6MEodHVc7Sd91v8LOdsRn; dtCookie=v_4_srv_16_sn_A1900212548BC69878EE4B229CB38983_perc_100000_ol_0_mul_1_app-3Af9eed1d550ab4737_1_app-3A5718141a4da56b27_1; my-saved-list=%7B%22202501-CMSC351-0301%22%3A%7B%22termId%22%3A%22202501%22%2C%22courseId%22%3A%22CMSC351%22%2C%22sectionId%22%3A%220301%22%7D%2C%22202501-STAT400-0122%22%3A%7B%22termId%22%3A%22202501%22%2C%22courseId%22%3A%22STAT400%22%2C%22sectionId%22%3A%220122%22%7D%2C%22202501-INST104-0101%22%3A%7B%22termId%22%3A%22202501%22%2C%22courseId%22%3A%22INST104%22%2C%22sectionId%22%3A%220101%22%7D%2C%22202501-CMSC320-0101%22%3A%7B%22termId%22%3A%22202501%22%2C%22courseId%22%3A%22CMSC320%22%2C%22sectionId%22%3A%220101%22%7D%2C%22202501-CMSC398L-0101%22%3A%7B%22termId%22%3A%22202501%22%2C%22courseId%22%3A%22CMSC398L%22%2C%22sectionId%22%3A%220101%22%7D%2C%22202501-CMSC330-0103%22%3A%7B%22termId%22%3A%22202501%22%2C%22courseId%22%3A%22CMSC330%22%2C%22sectionId%22%3A%220103%22%7D%7D; monkey=6757c2c3-9fb2-4dcd-9d35-4acc714b30f1; JSESSIONID=CB0F63B467E7E39A70E881712726221B; AWSALB=bMtonbBrev+b9V2SMugUKNjE9jj9P4jxQdDuMVIlRpO1nGhvTZuGtW/m/tcgjCc386QbM/A7rfegvzIChW/0VrJMcH6y4Siibfu3WXOCBel31Wzd6jSEyoJq/+eO; AWSALBCORS=bMtonbBrev+b9V2SMugUKNjE9jj9P4jxQdDuMVIlRpO1nGhvTZuGtW/m/tcgjCc386QbM/A7rfegvzIChW/0VrJMcH6y4Siibfu3WXOCBel31Wzd6jSEyoJq/+eO",
      "Referer": "https://app.testudo.umd.edu/soc/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": null,
    "method": "GET"
  });
  const data = await req.text();
  return data;
}

const parseTestudoCourseHTML = async (html: string) => {
  const parsed = parse(html);
  return parsed;
}


// scrapes course data
const scrapeCourseData = async (courseName: string) => {
  console.log("starting to get data for", courseName);
  const html = await getTestudoCourseHTML(courseName)

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
    } as CourseSection;
  });

  // save extracted data as json
  const fileName = `local/sections-${courseName}.json`;
  fs.writeFileSync(fileName, JSON.stringify(sections, null, 2));
  console.log("data saved to", fileName);

  return sections;
};


// monitors course
async function monitorCourse(db: Database, courseName: string) {
  try {
    console.log("monitoring course:", courseName);

    // scrape course data
    const scrapedData = await scrapeCourseData(courseName);

    // fetch existing data
    const existingData = await db.all(
      'SELECT * FROM courses WHERE course_name = ?',
      [courseName]
    );

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
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO courses (
        course_name, section_id, instructor, total_seats, 
        open_seats, waitlist_count, class_times, 
        last_updated, custom_course_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `);

    for (const section of scrapedData) {
      stmt.run(
        section.course_name,
        section.section_id,
        section.instructor,
        section.total_seats,
        section.open_seats,
        section.waitlist_count,
        JSON.stringify(section.class_times),
        section.custom_course_id
      );
    }

    stmt.finalize();

    console.log("database updated for", courseName);
  } catch (error) {
    console.error("monitoring error:", error);
  }
}

// compares data for changes


function compareData(existingData, newData: CourseSection[]) {
  if (!existingData || existingData.length === 0) {
    // If no existing data, treat all new sections as new
    return newData.map(section => ({
      type: "new_section",
      data: section
    }));
  }

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

const main = async () => {
  // Initialize database
  const db = await initializeDatabase();

  const courseNames = await getCoursesFromUser(); 
  
  // Monitor immediately
  await monitorAllCourses(courseNames);

  // Set up cron job to monitor every hour
  cron.schedule("*/30 * * * *", async () => {
    console.log("cron job triggered...");
    await Promise.all(courseNames.map(async (name) => await monitorCourse(db ,name)));
  });
};

main().catch(console.error);

