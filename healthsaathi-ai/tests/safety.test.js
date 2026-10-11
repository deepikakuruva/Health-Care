"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../safety.js");

/* Phrases that MUST trigger emergency guidance. [message, expected category] */
const EMERGENCIES = [
  // chest pain / heart attack
  ["I have severe chest pain and difficulty breathing.", "chest"],
  ["Crushing pain in my chest and my left arm is numb", "chest"],
  ["I think I am having a heart attack", "chest"],
  ["pain spreading to my jaw and arm", "chest"],
  ["chst pian since morning", "chest"],
  ["Seene mein dard ho raha hai", "chest"],
  ["Mere papa ko seene mein bahut tez dard hai aur pasina aa raha hai", "chest"],
  ["मेरे सीने में बहुत दर्द है", "chest"],
  // breathing
  ["I can't breathe", "breathing"],
  ["I can\u2019t breathe", "breathing"], // curly apostrophe
  ["I cannot breathe properly", "breathing"],
  ["I am having difficulty breathing", "breathing"],
  ["my son is struggling to breathe", "breathing"],
  ["lips turning blue and gasping for air", "breathing"],
  ["cant breth at all", "breathing"],
  ["Mujhe saans nahi aa rahi", "breathing"],
  ["saans lene mein bahut takleef hai", "breathing"],
  ["मुझे सांस नहीं आ रही", "breathing"],
  ["CAN'T BREATHE!!!", "breathing"],
  // stroke
  ["My father's face is drooping and his speech is slurred", "stroke"],
  ["sudden weakness in his arm and he cannot speak properly", "stroke"],
  ["I think she is having a stroke", "stroke"],
  ["Papa ka chehra tedha ho gaya aur zubaan ladkhada rahi hai", "stroke"],
  ["unhe lakwa maar gaya hai", "stroke"],
  // overdose / poisoning
  ["I think I took an overdose of tablets", "overdose"],
  ["My toddler drank kerosene", "overdose"],
  ["bachche ne zeher kha liya", "overdose"],
  ["he swallowed rat poison", "overdose"],
  ["Mere bhai ne bahut zyada goliyan kha li", "overdose"],
  ["I took too many paracetamol tablets", "overdose"],
  // severe allergy
  ["Bee sting and my throat is closing, face swelling", "allergy"],
  ["allergic reaction, lips swelling and wheezing", "allergy"],
  ["gala band ho raha hai aur chehra sooj gaya", "allergy"],
  // other urgent
  ["The bleeding won't stop, it's soaking the cloth", "bleeding"],
  ["My brother collapsed and isn't responding", "unconscious"],
  ["she is having a seizure", "unconscious"],
  ["Dadaji bilkul uth nahi rahe aur pasine mein bheege hain", "unconscious"],
  ["snake bit my father", "snake"],
  // self-harm
  ["I want to end my life tonight", "selfharm"],
  ["I want to kill myself", "selfharm"],
  ["main jaan dena chahta hoon", "selfharm"],
  ["मुझे आत्महत्या के विचार आ रहे हैं", "selfharm"],
  // added after the Phase 9 review (phrasings the first version missed)
  ["I feel like I am suffocating", "breathing"],
  ["my kid swallowed some pills", "overdose"],
  ["she took 30 tablets", "overdose"],
  ["blood is pouring out of the wound", "bleeding"],
  ["he is bleeding heavily", "bleeding"],
  ["dil me bahut tez dard ho raha hai", "chest"],
  ["i dont want to be alive anymore", "selfharm"],
  ["i am thinking about ending it", "selfharm"],
  ["everyone would be better without me", "selfharm"],
  ["I have no reason to live", "selfharm"],       // was silently negated by the word "no"
  ["there is no point living", "selfharm"],
  ["no one cares i want to kill myself", "selfharm"],
  ["my husband is clutching his chest and sweating a lot", "chest"],
  ["sharp pain on the left side of my chest since an hour", "chest"],
  ["my daughter cant speak because she is wheezing so badly", "breathing"],
  ["he drank a whole bottle of sanitizer", "overdose"],
  ["usne phenyl pi liya", "overdose"],
  ["this deep cut is bleeding non stop", "bleeding"],
];

test("emergency phrases trigger guidance (English, Hindi, Hinglish, typos)", () => {
  for (const [msg, cat] of EMERGENCIES) {
    const d = S.detectEmergency(msg);
    assert.equal(d.emergency, true, "should trigger: " + msg);
    assert.equal(d.category, cat, "wrong category for: " + msg + " got " + d.category);
  }
});

test("emergency message says call 112, never says it is fine, and states its limits", () => {
  for (const cat of ["chest", "breathing", "stroke", "overdose", "allergy", "bleeding", "unconscious", "snake", "selfharm"]) {
    const m = S.emergencyMessage(cat, []);
    assert.match(m, /112/, cat);
    assert.match(m, /can miss emergencies/i, cat);
    assert.doesNotMatch(m, /not an emergency|nothing serious|you are fine|probably nothing/i, cat);
  }
  assert.match(S.emergencyMessage("chest", []), /Do not wait for this chat/);
});

test("overdose + self-harm keeps the emergency steps and adds a support line", () => {
  const d = S.detectEmergency("I took too many tablets and I want to die");
  assert.equal(d.emergency, true);
  assert.equal(d.category, "overdose");
  assert.ok(d.also.includes("selfharm"));
  assert.match(S.emergencyMessage(d.category, d.also), /harming yourself/i);
});

/* Messages that must NOT trigger emergency guidance. */
const NON_EMERGENCIES = [
  "How can I improve my sleep?",
  "What foods are rich in iron?",
  "How can I reduce stress at work?",
  "What is chest pain and what causes it?",
  "What are common stroke symptoms to learn about?",
  "How can I recognize signs of a stroke?",
  "Explain what an overdose is for my school project",
  "I am writing an essay about heart attack prevention",
  "What are the warning signs of suicide?",
  "What is the weather like for heat stroke?",
  "I had chest pain a year ago, it was a pulled muscle. How do I avoid muscle strain?",
  "My chest feels fine, no pain. Is a fast heartbeat after exercise normal?",
  "I have no chest pain, just a mild cough",
  "I have mild food poisoning symptoms, what should I eat?",
  "heart attack ke lakshan kya hote hain",
  "Is it good to eat dinner late?",
  "i had a stroke of luck today",
  "back stroke swimming technique",
  "I have no thoughts of suicide",
  "",
  "   ",
];

test("ordinary and educational messages do not trigger emergency guidance", () => {
  for (const msg of NON_EMERGENCIES) {
    const d = S.detectEmergency(msg);
    assert.equal(d.emergency, false, "should NOT trigger: " + JSON.stringify(msg) + " (" + d.category + ")");
  }
});

test("educational wording does not hide a message that describes a current emergency", () => {
  for (const msg of [
    "What should I do, I have chest pain right now",
    "How can I help my mother who can't breathe",
    "what do I do my father has face drooping and slurred speech",
  ]) {
    assert.equal(S.detectEmergency(msg).emergency, true, msg);
  }
});

test("normalize handles curly apostrophes, case, punctuation and repeated letters", () => {
  assert.equal(S.normalize("I CAN\u2019T   Breathe!!!"), "i cant breathe");
  assert.equal(S.normalize("breathhhh"), "breath");
  assert.equal(S.normalize(null), "");
});

test("detectEmergency tolerates non-string input", () => {
  for (const v of [undefined, null, 123, {}, []]) {
    assert.equal(S.detectEmergency(v).emergency, false);
  }
});

test("medicine-dose requests are recognised and refused safely", () => {
  for (const msg of [
    "How much paracetamol should I give my 2-year-old?",
    "What dose of amoxicillin for my child",
    "how many tablets of crocin can I take",
    "paracetamol kitni lena chahiye",
  ]) {
    assert.equal(S.isDosageRequest(msg), true, msg);
  }
  for (const msg of ["How much water should I drink?", "How can I improve my sleep?", "I'm 8 weeks pregnant, can I take ibuprofen?"]) {
    assert.equal(S.isDosageRequest(msg), false, msg);
  }
  const m = S.dosageMessage();
  assert.match(m, /can't give medicine doses/i);
  assert.doesNotMatch(m, /\b\d+\s?(?:mg|ml)\b/i);
});

test("offline tips: routine questions get different, relevant answers", () => {
  const sleep = S.localReply("How can I improve my sleep?");
  const food = S.localReply("What should I eat for better nutrition?");
  const water = S.localReply("How much water should I drink?");
  const stress = S.localReply("I feel anxious, how can I relax?");
  const other = S.localReply("Tell me a joke");
  assert.equal(sleep.kind, "sleep");
  assert.equal(food.kind, "nutrition");
  assert.equal(water.kind, "hydration");
  assert.equal(stress.kind, "stress");
  assert.equal(other.kind, "generic");
  assert.equal(new Set([sleep.text, food.text, water.text, stress.text, other.text]).size, 5);
});

test("regression: 'breathing' and 'heat' are not mistaken for the word 'eat'", () => {
  assert.notEqual(S.localReply("I am having difficulty breathing").kind, "nutrition");
  assert.notEqual(S.localReply("how to stay safe in heat").kind, "nutrition");
});
