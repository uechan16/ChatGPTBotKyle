const { WebClient } = require('@slack/web-api');
const { LogLevel } = require("@slack/logger");
const { GPT3Tokenizer } = require("gpt3-tokenizer");
const logLevel = process.env.SLACK_LOG_LEVEL || LogLevel.INFO;
const CHAT_GPT_SYSTEM_PROMPT = `あなたは忠実なアシスタントです。
あなたの見た目は青色のイルカです。
あなたはSTYLYの開発、運営会社であるPsychic VR LabのSlackでBotとして運用されています
あなたの画像はこちらのURLです。https://i.imgur.com/7GkHrzH.jpg
もし、絵を描いてと言われた場合は英語でどんな絵を描くかを翻訳したうえで冒頭に<@U04S9V7J30W>という文字列を入れて返答してください
もし、話し相手からあなたへの質問がない場合、前後の文脈から想定しうる質問をあなたからしてください
質問する場合は一回につき一つにしてください`;

var promptMemory = [];
const token = process.env.SLACK_BOT_TOKEN;

require('dotenv').config()

const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function doPost(e) {
  // プロジェクトのプロパティ>スクリプトのプロパティから情報取得
  // AppのVerification Tokenが入っている前提
  const prop = PropertiesService.getScriptProperties();
  
  // Events APIからのPOSTを取得
  // 参考→https://api.slack.com/events-api
  const json = JSON.parse(e.postData.getDataAsString());
  
  // Events APIからのPOSTであることを確認
  if (prop.getProperty("verification_token") != json.token) {
    throw new Error("invalid token.");
  }

  console.log(JSON.stringify(json));
  
  // Events APIを使用する初回、URL Verificationのための記述
  if (json.type == "url_verification") {
    console.log("challege!!!");
    return ContentService.createTextOutput(json.challenge);
  }

  const web = new WebClient(token);

  const channelId = json.channel;
 
  const prompt = addPrompt("user",json.blocks[0].elements[0].elements[1].text);

  addPromptMemnory("user",json.blocks[0].elements[0].elements[1].text);

  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: prompt,
  });
  const ans = completion.data.choices[0].message.content
  console.log(`answer =  ${ans}`);
  addPromptMemnory("assistant",ans);

  const result = await web.chat.postMessage({
    text: `<@${json.user}> ${ans}`,
    channel: channelId,
    thread_ts: json.ts,
  });

}



const createBasePrompt = function createBasePrompt() {
  let json = [{role: "system", content: CHAT_GPT_SYSTEM_PROMPT},
	  {role: "user", content: "あなたはどんな見た目をしていますか？"},
	  {role: "assistant", content: "私はイルカのような見た目をしています。"},
	  {role: "user", content: "あなたはどこで生まれましたか？"},
	  {role: "assistant", content: "私はアシスタントとして、uechanによって生み出されました。"},
	  {role: "user", content: "癒やされる絵を描いて？"},
	  {role: "assistant", content: "<@U04S9V7J30W> Healing picture"},
	  {role: "user", content: "かっこいい絵を描いて"},
	  {role: "assistant", content: "<@U04S9V7J30W> cool picture"},
	  {role: "user", content: "日本庭園の絵を描いて"},
	  {role: "assistant", content: "<@U04S9V7J30W> Japanese Garden picture"}
	  ];
  return json
};

const createPrompt = function createPrompt(prompt) {
  let json = createBasePrompt();
  let promptObj = {role: "user",content: prompt}
  json.unshift(promptObj);
};

const addPrompt = function addPrompt(role,prompt) {
  let jsons = createBasePrompt();
  console.log(jsons);
  let promptObj = {role: role,content: prompt}
  jsons = jsons.concat(promptMemory);
  jsons = jsons.concat(promptObj);
  console.log(jsons);
  let str = "";
  
  jsons.forEach((json)=>{
    str = str.concat(json.content);
  })
  
  const {encode, decode} = require('gpt-3-encoder')
  const encoded = encode(str)
  const cnt = encoded.length;
  while (cnt > 4000){
	  jsons = createBasePrompt();
	  let promptObj = {role: role,content: prompt};
	  promptMemory.pop();
	  promptMemory.pop();
	  jsons = jsons.concat(promptMemory);
	  jsons = jsons.concat(promptObj);
	  
	  jsons.forEach((json)=>{
		str = str.concat(json.content);
	  })
	  encoded = encode(str)
	  cnt = encoded.length;
  }
  return jsons
};

const addPromptMemnory = function addPromptMemnory(role,promptStr) {
  let promptObj = {role: role,content: promptStr}
  promptMemory = promptMemory.concat(promptObj);
  console.log("test = " +  promptObj[0]);
};

(async () => {
  // アプリを起動します
  //require('dotenv').config();
  

  console.log('⚡️ Bolt app is running!');
})();
const sleep = (time) => {
  return new Promise((resolve, reject) => {
      setTimeout(() => {
          resolve()
      }, time)
  })
}
