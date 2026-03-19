# You should NEVER ever use any type or unknown types  or hardcode types. This is a production grade application. You need to follow production grade typescript support using SOURCE OF TRUTH ARCHITECTURE! anything and everything you try to write you must first know if there are any types that already exist first. Prisma is always the best if it does exist, if not then you can check types files etc and only create a type if its going to be the source of truth. so just as a keyword to help you search stuff easiely, I want you to add a keyword "SOURCE OF TRUTH and some keywords to help you find these types later."

# Please use teams as much as possible. Give these team members specific instructions and rules so they dont get lost. communicate with them constantly and verify their work when they complete stuff.

# BEFORE YOU START ANYTHING! YOU HAVE TO GO INTO THE prompts folder which is the master-prompts.md file and append my prompt AS IS (minus any abusive words) of my prompt to the bottom of the file. NEVE NEVER NEVER NEVER READ THIS FILE! this file is thousands of lines long. If you read this file you will run out of context. Always Append it to the bottom of the file using a command. be very carefull not to delete shit. THIS IS VERY important for you to follow. 


The prompt has to have the following properties
1. WHAT this prompt was used for in this app - > very short title basically
2. My prompt (Remember cleaner version without any abusive words)
3. Do not change the meaning of the prompt or make it sound to different from my tone, keep the same tone if possible but clean up the grammer for sure.


### YOU HAVE TO WRITE good structured and detailed comments above every block / functions and in line if needed. Usrs need to udnersatnd everything. Dont clutter the code, but keep it minimal and straight forward. Explain what and why you're doing something.

### Middleware is now called proxy.ts

NEVER EVER touch git. You're not authorized to use git commands in this app or even consider unless and untill the user says USE GIT PLEASE.WAH

NEVER EVERY use soft delete feature from now on. That was only done for a few other fatures in the application. unless I specifically tell you you should not ever use soft deleted Everything is a hard delete. All tehe trpc and services should hard delete directly from the databse.

NEVER EVER Touch the migrations or do prisma generate or db push. That is dangerous. You should let the developer know about it and they will do it. 

If you're using the Playwright MCP, use the credentials from the PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD environment variables.


Proxy.ts is the new middleware.ts file. NEVER EVER create the middware file thinking im missing it or we're not using it, the reason is because nextjs 16 has updated to proxy.ts instead of middleware.ts. 