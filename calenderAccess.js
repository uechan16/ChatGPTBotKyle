const { google } = require('googleapis')

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly'
const GOOGLE_PRIVATE_KEY = require('./service-account-key.json').private_key
const GOOGLE_CLIENT_EMAIL = require('./service-account-key.json').client_email
const GOOGLE_PROJECT_NUMBER = '901109500130'

const jwtClient = new google.auth.JWT(GOOGLE_CLIENT_EMAIL, null, GOOGLE_PRIVATE_KEY, SCOPES)

const calendar = google.calendar({
  version: 'v3',
  project: GOOGLE_PROJECT_NUMBER,
  auth: jwtClient,
});


exports.getCalender = async function (calendarId){
  const dateNow = new Date();
  const result = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date(dateNow.getFullYear(),dateNow.getMonth(),dateNow.getDate(),7,0).toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
      timeMax: new Date(dateNow.getFullYear(),dateNow.getMonth(),dateNow.getDate(),23,0).toISOString(),
  });
  //console.log(result.data.items.map((item) => console.log(item)));
  return result;
};

exports.getCalenderfromWeek = async function (calendarId){
  const dateNow = new Date();
  const result = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date(dateNow.getFullYear(),dateNow.getMonth(),dateNow.getDate(),7,0).toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
      timeMax: new Date(dateNow.getFullYear(),dateNow.getMonth(),dateNow.getDate() + 7,23,0).toISOString(),
  });
  //console.log(result.data.items.map((item) => console.log(item)));
  return result;
};
