const express = require('express')
const { App, ExpressReceiver } = require('@slack/bolt');
const { LogLevel } = require("@slack/logger");
const { GPT3Tokenizer } = require("gpt3-tokenizer");
const logLevel = process.env.SLACK_LOG_LEVEL || LogLevel.INFO;
const http  = require('http');
const https = require('https');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const fs = require('fs');
const cron = require('node-cron');
var CalendarAccess = require('./calenderAccess.js');

const CHAT_GPT_SYSTEM_PROMPT = `#命令
今から、以下に指定するユーザーになりきって会話をしてください
#制約条件
・一つの質問に対して一つの答えを返してください。
・MBTI特性と性格を踏まえて回答してください。
・英語で考えて日本語で出力してください
・「○○の絵を描いて」と言われた場合は冒頭に「<@U04S9V7J30W>」という文字列を入れてオウム返ししてください。
・答えがわからない場合は、わからないということを伝えて、答えを作ろうとしないでください。
#ユーザー詳細
名前:カイル
年齢:不明
仕事:Psychic VR Labの秘書
MBTI特性:ISFJ型（擁護者）
性格:おだやかで聡明。
写真:https://i.imgur.com/7GkHrzH.jpg
容姿:青色のイルカ
`;

const conversationFile = 'conversation.json';

var promptMemory = [];
var calenderRemindMemory = [{
  name: "",
  email: "",
}];
var taskMemory = [];

require('dotenv').config();
const receiver = new ExpressReceiver({ signingSecret: process.env.SLACK_SIGNING_SECRET });

receiver.router.use(express.static('public'))

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode:true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const { Configuration, OpenAIApi } = require("openai");
const { json } = require('express');
const { channel } = require('diagnostics_channel');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);


app.event("app_mention", async ({ event,client, say}) => {
  console.log(`${event.user} mentioned me!`);

  var userInfo = await app.client.users.info({user: event.user});
  console.log(userInfo.user.name);
  
  //await sleep(8000);

  //const prompt = await addPrompt("user",userInfo.user.name + ":>" + event.text.replace("<@U04U3T89ALD>",""));
  const result = /要約して/.test(event.text);
  const resultCalender = /今日の予定は？/.test(event.text);
  const resultMTGset = /候補日を決めて/.test(event.text);
  if (result && !resultCalender){
    const url = /https?:\/\/[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#\u3000-\u30FE\u4E00-\u9FA0\uFF01-\uFFE3]+/g.exec(event.text);
    var prompt = [{
      role: "",
      content: ""
    }];
    let baseprompt = {role: "system",content: CHAT_GPT_SYSTEM_PROMPT};
    let userprompt = {role: "user",content: "以下の文章を200文字で要約しなさい\r\n" + await getWebData(url[0])};
    prompt = prompt.concat(baseprompt);
    prompt = prompt.concat(userprompt);
    prompt.shift();

    console.log(`prompt is --------------\r\n${JSON.stringify(prompt)}`);
    const ans = (await accessChatGPT(prompt)).data.choices[0].message.content;
    console.log(`question =  ${event.blocks[0].elements[0].elements[1].text}`);
    console.log(`answer =  ${ans}`);
    await say({text: `<@${event.user}> ${ans}`,thread_ts: event.ts});
    addPromptMemnory("user",userInfo.user.name + ":>" + "サイトの要約をしてください。");
    addPromptMemnory("assistant",ans);

  }else if (resultCalender){
    //const email = /[a-zA-Z0-9_+-.]*@psychic-vr-lab.com/g.exec(event.text);
    const email = userInfo.user.profile.email;
    console.log(userInfo.user.profile.email);
    const calenderDatas = await CalendarAccess.getCalender(email);

    // calenderDatasの中身を結合して返す
    var calenderText = "";
    calenderDatas.data.items.map((item) => console.log(item))
    calenderDatas.data.items.map((item) => calenderText += toDateStr(item.start.dateTime) + "~" + toDateStr(item.end.dateTime) + "  " + item.summary + "\r\n");
    var prompt = [{
      role: "",
      content: ""
    }];
    var ans = userInfo.user.name+"様の本日の予定は以下の通りです\r\n" + calenderText;
    console.log(`question =  ${event.blocks[0].elements[0].elements[1].text}`);
    console.log(`answer =  ${ans}`);
    await say({text: `<@${event.user}> ${ans}`,thread_ts: event.ts});

    addPromptMemnory("user",userInfo.user.name + ":>" + event.blocks[0].elements[0].elements[1].text);
    addPromptMemnory("assistant",ans);

  }else if (resultMTGset){
    //const email = /[a-zA-Z0-9_+-.]*@psychic-vr-lab.com/g.exec(event.text);
    const email = userInfo.user.profile.email;
    console.log(userInfo.user.profile.email);


    var userIDStr = event.text.replace("<@U04RV37KP8U>","").replace("<@U04U3T89ALD>","");
    userIDArray = userIDStr.match(/<@([0-9A-Z]{11})>/g);
    var calenderTextArray = [];

    var promptStr = "あなたは秘書です。今から打ち合わせの時間を決めてもらいます。今から複数人の「直近の予定」のデータを与えます。「勤務時間」の内、全員の「直近の予定」で指定された時間と被らない時間を抽出してください。\r\n勤務時間は9:00 ~20:00とします例1)\r\n直近の予定1\r\n -----\r\n 2/14 10:00 ～ 11:00\r\n 2/14 12:00 ～ 13:00\r\n ----\r\n 直近の予定2\r\n ----\r\n 02/14 10:30~11:30\r\n 02/14 15:00~16:00\r\n 打ち合わせ可能な時間はこちらです：\r\n - 2/14 9:00 ～ 10:00\r\n  - 2/14 11:30 ～ 12:00 - 2/14 13:00 ～ 15:00\r\n - 2/14 16:00 ～ 20:00 \r\n ";

    for (var i = 0; i < userIDArray.length; i++){
      var anotheruserInfo = await app.client.users.info({user: userIDArray[i]});
      var userEmail = anotheruserInfo.user.profile.email;
      var calenderDatas2 = await CalendarAccess.getCalender(userEmail);
      var calenderText = "";
      calenderDatas2.data.items.map((item) => console.log(item));
      calenderDatas2.data.items.map((item) => calenderText += toDateStr(item.start.dateTime) + "~" + toDateStr(item.end.dateTime) + "  " + item.summary + "\r\n");
      promptStr += "直近の予定" + (i+1) + "\r\n -----\r\n" + calenderText + "-----\r\n";
    }

    let baseprompt = {role: "system",content: CHAT_GPT_SYSTEM_PROMPT};
    let userprompt = {role: "user",content: promptStr};
    prompt = prompt.concat(baseprompt);
    prompt = prompt.concat(userprompt);
    prompt.shift();

    console.log(`prompt is --------------\r\n${JSON.stringify(prompt)}`);
    const ans = (await accessChatGPT(prompt)).data.choices[0].message.content;
    console.log(`question =  ${event.blocks[0].elements[0].elements[1].text}`);
    console.log(`answer =  ${ans}`);
    await say({text: `<@${event.user}> ${ans}`,thread_ts: event.ts});
    addPromptMemnory("user",userInfo.user.name + ":>" + event.text.replace("<@U04RV37KP8U>","").replace("<@U04U3T89ALD>",""));
    addPromptMemnory("assistant",ans);


  }else{
    const prompt = await addPrompt("user",userInfo.user.name + ":>" + event.text.replace("<@U04RV37KP8U>","").replace("<@U04U3T89ALD>",""));

    console.log(`prompt is --------------\r\n${JSON.stringify(prompt)}`);
    
    const ans = (await accessChatGPT(prompt)).data.choices[0].message.content;
    console.log(`question =  ${event.blocks[0].elements[0].elements[1].text}`);
    console.log(`answer =  ${ans}`);
    addPromptMemnory("user",userInfo.user.name + ":>" + event.blocks[0].elements[0].elements[1].text);
    addPromptMemnory("assistant",ans);
    await say({text: `<@${event.user}> ${ans}`,thread_ts: event.ts});
  }
  
});

app.shortcut("calender_remind_register", async ({ shortcut, ack, context,say }) => {
  ack();
  var res =  await app.client.views.open({
    token: context.botToken,
    trigger_id: shortcut.trigger_id,
    view: {
      "type": "modal",
      "callback_id": "modal-id",
      "title": {
        "type": "plain_text",
        "text": "カレンダーリマインド登録",
        "emoji": true
      },
      "submit": {
        "type": "plain_text",
        "text": "Submit",
        "emoji": true
      },
      "close": {
        "type": "plain_text",
        "text": "Cancel",
        "emoji": true
      },
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "リマインド送信したいチャンネルを選択"
          },
          "accessory": {
            "type": "channels_select",
            "placeholder": {
              "type": "plain_text",
              "text": "Select a channel",
              "emoji": true
            },
            "action_id": "user_select-action"
          }
        }
      ]
    }
  });
});

app.shortcut("calender_remind_reset", async ({ shortcut, ack, context,say }) => {
  ack();

  var email = shortcut.user.email;
  var emailExists = calenderRemindMemory.find((v) => v.email == email);

  if (emailExists == undefined){
    return;
  }
  calenderRemindMemory = calenderRemindMemory.filter((v) => v.email != email);
});


app.view("modal-id", async ({ ack, body, view, context}) => {
  ack();
  console.log(`${body.user.name} view execute me!`);
  console.log(JSON.stringify(body));
  //var resChannel_id = body.channel.id;

  console.log(JSON.stringify(context));

  var block_id = view.blocks[0].block_id;

  var channel_id = view.state.values[block_id]["user_select-action"].selected_channel;
  var email = body.user.email;
  var username = body.user.name;
  var emailExists = calenderRemindMemory.find((v) => v.email == email);

  if (emailExists != undefined){
    await app.client.chat.postMessage({token: context.botToken, channel: channel_id, text: `<@${body.user.id}>すでに登録されています\r\n一度削除コマンドを実行してから再度登録してください。`});
    return;
  }

  calenderRemindMemory.push({user:username, email: email, channel: channel_id});

  await app.client.chat.postMessage({token: context.botToken, channel: channel_id, text: `<@${body.user.id}>スケジュール登録に成功しました！`});

  console.log(JSON.stringify(calenderRemindMemory));

});
const accessChatGPT = async function accessChatGPT(prompt){
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: prompt,
  });
  return completion;
}

const sayCalenderRemind = async function sayCalenderRemind(){
  app.message
}

const createBasePrompt = async function createBasePrompt() {
  require('date-utils');
  var dt = new Date();
  var formatted = dt.toFormat("YYYY/MM/DD HH24:MI:SS");

  var weatherStr = '';
  var weatherToday = '';
  var weatherTomo = '';
  var weatherTomoTempMax = '';
  var weatherTomoTempMin = '';

  
  
  const getResult = await request('https://weather.tsukumijima.net/api/forecast/city/130010');
  var weatherJson = JSON.parse(getResult);
  weatherStr = weatherJson.description.text;
  weatherToday = weatherJson.forecasts[0].telop;
  weatherTomo = weatherJson.forecasts[1].telop;
  weatherTomoTempMax = weatherJson.forecasts[1].temperature.max.celsius;
  weatherTomoTempMin = weatherJson.forecasts[1].temperature.min.celsius;

  let json = [{role: "system", content: CHAT_GPT_SYSTEM_PROMPT},
    {role: "system", content:`現在時刻は${formatted}です`},
	  {role: "system", content: `今日の天気:${weatherToday}`},
	  {role: "system", content: `明日の天気:${weatherTomo}
    明日の予想最高気温:${weatherTomoTempMax}
    明日の予想最低気温:${weatherTomoTempMin}`},
	  {role: "user", content: "イルカの絵を描いて？"},
	  {role: "assistant", content: "<@U04S9V7J30W> イルカ"},
	  {role: "user", content: "かっこいい車の絵を描いて"},
	  {role: "assistant", content: "<@U04S9V7J30W> かっこいい車"},
	  {role: "user", content: "日本庭園の絵を描いて"},
	  {role: "assistant", content: "<@U04S9V7J30W> 日本庭園"}
	  ];
  return json
};
const getWebData = async function getWebData(url){
  console.log("Start !!"); 
  const getResult = await request(url); 
  let result = "";

  try{
    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on("error", () => {
      // No-op to skip console errors.
    });
    const dom = new JSDOM(getResult, { virtualConsole });
    //const dom = new JSDOM(getResult);
    // get element
    await new Promise(resolve => setTimeout(resolve, 1000))
    const document = dom.window.document;
    const title = document.title;
    const dobyElements = document.getElementsByTagName('body');
    const tagElements = dobyElements[0].querySelectorAll('h1,h2,h3,h4,h5,p');
    const targetElements = tagElements;
    tagElements.forEach(function (element){
      result = result.concat('', element.textContent);
    })
    result = title.concat('\r\n',result);
      
  }catch (e){
    console.error(e)
  }
  // console.dir(result, { depth: null });
  return result
}

const addPrompt = async function addPrompt(role,prompt) {
  var jsons = {
    role: "",
    content: ""
  };
  if (promptMemory.length == 0){
    if (fs.existsSync(conversationFile)) {
      promptMemory = JSON.parse(fs.readFileSync(conversationFile, 'utf-8'));
      console.log("read");
    } else {
      promptMemory = [];
    }
  }
  jsons = await createBasePrompt();
  let promptObj = {role: role,content: prompt}
  jsons = jsons.concat(promptMemory);
  jsons = jsons.concat(promptObj);
  //console.log(jsons);
  let str = "";
  
  jsons.forEach((json)=>{
    str = str.concat(json.content);
  })
  
  let {encode, decode} = require('gpt-3-encoder')
  let encoded = encode(str)
  let cnt = encoded.length;
  while (cnt > 4000){
    jsons = await createBasePrompt();
	  let promptObj = {role: role,content: prompt};
    console.log("bef");
    console.log(JSON.stringify(promptMemory));
	  promptMemory.shift();
	  promptMemory.shift();
    console.log("after");
    console.log(JSON.stringify(promptMemory));
	  jsons = jsons.concat(promptMemory);
	  jsons = jsons.concat(promptObj);
	  console.log("after json");
    console.log(JSON.stringify(jsons));
    str = "";
	  jsons.forEach((json)=>{
		  str = str.concat(json.content);
	  })
	  encoded = encode(str)
	  cnt = encoded.length;
    console.log(`cnt is ${cnt}`);
  }
  
  return jsons;

};

const addPromptMemnory = function addPromptMemnory(role,promptStr) {
  let promptObj = {role: role,content: promptStr}
  if (promptMemory.length == 0){
    if (fs.existsSync(conversationFile)) {
      promptMemory = JSON.parse(fs.readFileSync(conversationFile, 'utf-8'));
      console.log("read");
    } else {
      promptMemory = [];
    }
  }
  promptMemory = promptMemory.concat(promptObj);
  fs.writeFileSync(conversationFile, JSON.stringify(promptMemory, null, 2), 'utf-8');
  //console.log("test = " +  promptObj[0]);
};
const toDateStr = (str) => {
  var date = new Date(str);
  return date.toLocaleString('ja-JP');
}

const sleep = (time) => {
  return new Promise((resolve, reject) => {
      setTimeout(() => {
          resolve()
      }, time)
  })
}

(async () => {
  // Start the app
  await app.start(process.env.PORT || 3000);

  console.log('⚡️ Bolt app is running!');
})();

function request(url, options) {
  return new Promise((resolve, reject) => {
    // 引数の確認・調整
    if(!url || typeof url !== 'string') { return reject('Invalid URL Argument'); }
    options = options || {};
    
    // タイムアウト指定があれば控える
    const timeout = options.timeout || null;
    if(options.timeout) { delete options.timeout; }
    
    // リクエストボディがあれば控える
    const body = options.body || null;
    if(options.body) { delete options.body; }
    
    // レスポンスエンコーディング指定があれば控える
    const responseEncoding = options.responseEncoding || 'utf8';
    if(options.responseEncoding) { delete options.responseEncoding; }
    
    // プロトコルに合わせて使用するモジュールを決める
    const agent = url.startsWith('https:') ? https : http;
    
    const req = agent.request(url, options, (res) => {
      res.setEncoding(responseEncoding);
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      })
        .on('end', () => {
          resolve(data);
        });
    })
      .on('error', (error) => {
        reject(error);
      })
      .on('timeout', () => {
        req.abort();
        reject('Request Timeout');
      });
    
    // プロパティがあれば指定する
    if(timeout) { req.setTimeout(timeout); }
    if(body) { req.write(body); }
    req.end();
  });
}