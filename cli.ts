#!/usr/bin/env tsx
import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import {
  getMappings,
  addMapping,
  removeMapping,
  monitorAllCourses,
} from "./monitor-util"; // adjust path as needed

const program = new Command();
program
  .name("course-monitor")
  .description("CLI to manage and run UMD Testudo course monitoring")
  .version("1.0.0");

// monitor command
program
  .command("monitor")
  .description("Start continuous monitoring loop")
  .option("-i, --interval <minutes>", "poll interval in minutes", "15")
  .action(async (opts) => {
    const minutes = parseInt(opts.interval, 10);
    console.log(chalk.green(`starting monitor (interval: ${minutes} min)`));
    await monitorAllCourses();
    setInterval(async () => {
      console.log(chalk.green("interval tick: checking all courses"));
      await monitorAllCourses();
    }, minutes * 60 * 1000);
  });

// add mapping
program
  .command("add")
  .description("Add or update a user→courses mapping")
  .action(async () => {
    const { email, courses } = await inquirer.prompt([
      {
        type: "input",
        name: "email",
        message: "email address:",
      },
      {
        type: "input",
        name: "courses",
        message: "courses (comma-separated):",
        filter: (input: string) => input.split(",").map((c) => c.trim()),
      },
    ]);
    addMapping(email, courses);
    console.log(chalk.blue(`mapping saved: ${email} → ${courses.join(", ")}`));
  });

// list mappings
program
  .command("list")
  .description("List all user→courses mappings")
  .action(() => {
    const mappings = getMappings();
    console.log(chalk.yellow("current mappings:"));
    for (const [email, courses] of Object.entries(mappings)) {
      console.log(`  ${chalk.cyan(email)}: ${courses.join(", ")}`);
    }
  });

// remove mapping
program
  .command("remove <email>")
  .description("Remove mapping for a given email")
  .action((email: string) => {
    const mappings = getMappings();
    if (mappings[email]) {
      removeMapping(email);
      console.log(chalk.red(`removed mapping for ${email}`));
    } else {
      console.log(chalk.gray(`no mapping found for ${email}`));
    }
  });

program.parse(process.argv);
