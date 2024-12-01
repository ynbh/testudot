# course monitoring application

## overview

this is a nodejs-based course monitoring application that scrapes course section information from the university of maryland's course registration system, tracks changes, and sends email notifications when updates occur.

## features

- web scraping of course sections using puppeteer
- real-time monitoring of course availability
- email notifications for:
  - new sections
  - seat availability changes
  - section removals
- automated scheduling with cron jobs
- supabase database integration

## prerequisites

- nodejs (version 16+ recommended)
- npm
- google email account
- supabase account

## setup instructions

### 1. clone the repository

```bash
git clone testudot
cd testudot
```

### 2. install dependencies

```bash
npm install
```

### 3. google app password setup

to send emails, you'll need to set up a google app password:

1. go to your google account
2. navigate to security settings
3. enable 2-step verification
4. go to "app passwords"
5. select "mail" and "other (custom name)"
6. generate the app password
7. replace the current email credentials in the code with your new app password

### 4. supabase configuration

1. create a new supabase project
2. replace the `supabaseUrl` and `supabaseKey` with your project's credentials
3. create a `courses` table with columns matching the interface in the code

### 5. configure environment variables

create a `.env` file in the project root and add:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### 6. run the application

```bash
npm start
```

## usage

when you run the application, you'll be prompted to enter course names separated by commas. the app will:

- immediately start monitoring
- send email notifications on changes
- repeat monitoring every 30 minutes

## important notes

- ensure you have proper permissions for web scraping
- be mindful of the university's terms of service
- the application uses headless browser scraping, which may be subject to changes in the website's structure

## technologies used

- puppeteer
- node-html-parser
- nodemailer
- supabase
- node-cron
- typescript

## license

MIT License. do what you want with this at your will.
