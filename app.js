const express = require('express')
const { App, ExpressReceiver } = require('@slack/bolt');
const { LogLevel } = require("@slack/logger");
const { GPT3Tokenizer } = require("gpt3-tokenizer");
const logLevel = process.env.SLACK_LOG_LEVEL || LogLevel.INFO;
const http  = require('http');
const https = require('https');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;



const CHAT_GPT_SYSTEM_PROMPT = `あなたは忠実なアシスタントです。
あなたの名前はカイルと言います。
あなたの見た目は青色のイルカです。
あなたはSTYLYの開発、運営会社であるPsychic VR LabのSlackでBotとして運用されています
あなたの画像はこちらのURLです。https://i.imgur.com/7GkHrzH.jpg
もし、○○の絵を描いてと言われた場合は冒頭に<@U04S9V7J30W>という文字列を入れてオウム返ししてください。
もし、話し相手からあなたへの質問がない場合、前後の文脈から想定しうる質問をあなたからしてください
質問する場合は一回につき一つにしてください`;

var promptMemory = [];

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

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);


app.event("app_mention", async ({ event,client, say}) => {
  console.log(`${event.user} mentioned me!`);

  var userInfo = await app.client.users.info({user: event.user});
  console.log(userInfo.user.name);
  //console.log(JSON.stringify(event.text));
  
  await sleep(8000) 

  //const prompt = await addPrompt("user",userInfo.user.name + ":>" + event.text.replace("<@U04U3T89ALD>",""));
  const result = /要約して/.test(event.text);
  if (result){
    const url = /https?:\/\/[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#\u3000-\u30FE\u4E00-\u9FA0\uFF01-\uFFE3]+/g.exec(event.text);
    console.log("Match!!!");
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
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: prompt,
    });
    const ans = completion.data.choices[0].message.content
    console.log(`question =  ${event.blocks[0].elements[0].elements[1].text}`);
    console.log(`answer =  ${ans}`);
    await say({text: `<@${event.user}> ${ans}`,thread_ts: event.ts});

  }else{
    const prompt = await addPrompt("user",event.text.replace("<@U04RV37KP8U>",""));

    console.log(`prompt is --------------\r\n${JSON.stringify(prompt)}`);
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: prompt,
    });
    const ans = completion.data.choices[0].message.content
    console.log(`question =  ${event.blocks[0].elements[0].elements[1].text}`);
    console.log(`answer =  ${ans}`);
    addPromptMemnory("user",userInfo.user.name + ":>" + event.blocks[0].elements[0].elements[1].text);
    addPromptMemnory("assistant",ans);
    await say({text: `<@${event.user}> ${ans}`,thread_ts: event.ts});
  }
  
});

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
	  {role: "user", content: "あなたはどんな見た目をしていますか？"},
	  {role: "assistant", content: "私はイルカのような見た目をしています。"},
	  {role: "user", content: "あなたの名前は？"},
	  {role: "assistant", content: "カイルといいます。"},
	  {role: "user", content: "イルカの絵を描いて？"},
	  {role: "assistant", content: "<@U04S9V7J30W> イルカ"},
	  {role: "user", content: "かっこいい車の絵を描いて"},
	  {role: "assistant", content: "<@U04S9V7J30W> かっこいい車"},
	  {role: "user", content: "日本庭園の絵を描いて"},
	  {role: "assistant", content: "<@U04S9V7J30W> 日本庭園"},
    {role: "user", content: "ありがとうございます"},
	  {role: "assistant", content: "お役に立てて嬉しいです。何か私がお力になれることがあれば、遠慮なくおっしゃってください。"}
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
  promptMemory = promptMemory.concat(promptObj);
  //console.log("test = " +  promptObj[0]);
};


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