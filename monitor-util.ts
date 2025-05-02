import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { monitorCourse } from './monitor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAPPINGS_FILE = path.resolve(__dirname, 'user-course-map.json');

// read current email to courses mappings from disk or return an empty object
export function getMappings(): Record<string, string[]> {
  if (!fs.existsSync(MAPPINGS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(MAPPINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.log(chalk.red('failed to read mappings, resetting to empty:'), err);
    return {};
  }
}

// add or update a mapping for an email to a set of courses, then save to disk
export function addMapping(email: string, courses: string[]): void {
  const mappings = getMappings();
  mappings[email] = courses;
  fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf-8');
  console.log(chalk.blue(`saved mapping: ${email} → ${courses.join(', ')}`));
}

// remove an existing mapping for a given email
export function removeMapping(email: string): void {
  const mappings = getMappings();
  if (mappings[email]) {
    delete mappings[email];
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), 'utf-8');
    console.log(chalk.red(`removed mapping for ${email}`));
  } else {
    console.log(chalk.gray(`no mapping found for ${email}`));
  }
}

// invoke monitoring for every course in the current mappings
export async function monitorAllCourses(): Promise<void> {
  const mappings = getMappings();
  const allCourses = Array.from(new Set(Object.values(mappings).flat()));
  await Promise.all(allCourses.map((course) => monitorCourse(course)));
}
