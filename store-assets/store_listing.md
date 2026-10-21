# Chrome Web Store listing text

Paste these into the Developer Dashboard. Edit the bracketed parts.

## Store listing tab

Name (from manifest): Browsing Study Recorder

Summary (from manifest): For research participants. Records the web pages visited and links clicked until you click Finish, then exports a file to upload.

Category: Tools (or Education)

Language: English

Description:

This extension is for people taking part in a research study run by [YOUR NAME / ORGANIZATION]. Install it only if a study has asked you to.

How it works:
1. Paste your Prolific ID and click Start.
2. Browse the web normally to answer the study question.
3. When the survey tells you to stop, click Finish, download your file, and upload it to the survey.
4. Remove the extension. The completion page has a button that does this for you.

What is recorded, only between Start and Finish: the pages you visit, the links you click, your searches, scroll depth, and time on each page. On most sites only the page address is kept, without query strings.

What is never recorded: anything before you click Start or after you click Finish, passwords, form entries, email, sign-in pages, Prolific, the study survey, and your browser history.

Your data stays on your computer. Nothing is sent anywhere by the extension. You choose whether to upload the file, and you can open it to see exactly what it contains.

Screenshots: upload the three PNGs in this folder (1280x800).

## Privacy tab

Single purpose description:
Records a participant's web browsing during a research session and exports it as a file the participant uploads to a study survey.

Permission justifications:

storage: Saves the session's recorded events on the participant's computer until they download the file.

Host permissions (http://*/* and https://*/*): The study measures how participants search for information, so it needs to record which pages they visit and which links they follow wherever their search leads, not only on one site. The content script records nothing unless the participant has started a session, and recording stops when the participant clicks Finish. Participants are instructed to remove the extension at the end of the study, and the completion page offers a one-click remove button. It never reads form fields other than a submitted search box, strips query strings from ordinary URLs, and skips email, sign-in, and survey sites. No data leaves the participant's computer unless they upload the exported file themselves.

Remote code: No, I am not using remote code.

Data usage, check these boxes:
- Web history
- User activity
- Personally identifiable information (the Prolific ID)

Certify all three statements (not sold to third parties, not used for unrelated purposes, not used for creditworthiness).

Privacy policy URL: [URL where you host privacy_policy.md]

## Distribution tab

Visibility: Unlisted
Regions: All regions (or only the countries you recruit from on Prolific)
Price: Free

## Note for the reviewer (Test instructions, if the dashboard offers the field)

Click the toolbar icon, paste any 24-character ID such as 5f8a2c1b9d3e4f5a6b7c8d9e, and click Start. Browse a few pages, then click the icon and choose Finish to see the export and remove steps.
