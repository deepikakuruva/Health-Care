/*
 * HealthSaathi AI - safety rules (prototype)
 *
 * Shared by the browser (window.HealthSaathiSafety) and the server (require).
 * Deterministic, rule-based, and independent of any AI provider, so emergency
 * guidance still works when Gemini is unavailable.
 *
 * IMPORTANT LIMITS: phrase matching is a safety net, NOT reliable emergency
 * detection. It will miss some phrasings, spellings, languages and indirect
 * descriptions. It has NOT been clinically validated. The wording below
 * needs review by a qualified clinician before any real-world use.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HealthSaathiSafety = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- text normalisation ---------- */
  function normalize(input) {
    var t = String(input == null ? "" : input);
    try { t = t.normalize("NFC"); } catch (e) { /* very old engines */ }
    t = t.toLowerCase();
    t = t.replace(/[\u2018\u2019\u201B\u02BC\u0060\u00B4]/g, "'"); // curly -> straight
    t = t.replace(/'/g, "");                                       // can't -> cant
    t = t.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ");                  // punctuation -> space
    t = t.replace(/(.)\1{2,}/gu, "$1");                            // breathhhh -> breath
    return t.replace(/\s+/g, " ").trim();
  }

  /* ---------- emergency phrase groups ---------- */
  var NEG = "(?:cant|cannot|can not|cnt|unable to|not able to|couldnt|could not|unable|hardly able to|struggling to|trouble|difficulty|difficult|hard to|problem|problems)";
  var CAUSE = "(?:poison\\w*|pesticide|insecticide|kerosene|petrol|bleach|phenyl|phenol|acid|rat poison|rat killer|detergent|harpic|toilet cleaner|sanitizer|sanitiser|chemical|mosquito coil|naphthalene|moth ?ball|methanol|dettol|weed ?killer|fertili[sz]er)";

  var GROUPS = [
    { category: "chest", patterns: [
      /\bchest\b.{0,30}\b(?:pain|pains|painful|pressure|tight\w*|crushing|squeez\w*|heav\w*|hurt\w*|burning|discomfort)\b/,
      /\b(?:pain|pains|pressure|tightness|ache|discomfort)\b.{0,20}\b(?:in|on|across|around|at)\b.{0,30}\b(?:chest|breast ?bone|sternum)\b/,
      /\b(?:clutch\w*|grabb\w*|holding)\b.{0,15}\bchest\b/,
      /\bch[ea]?e?s?t\b.{0,20}\bp(?:ain|ian|ayn|aen|ane)\b/,
      /\bheart ?attack\b|\bcardiac arrest\b/,
      /\bpain\b.{0,15}\b(?:spreading|radiating|going)\b.{0,15}\b(?:arm|jaw|shoulder)\b/,
      /\b(?:seene|seena|sine|sina|chhati|chati|chaati)\b.{0,30}\b(?:dard|dukh|jalan|bhaari|bhari|bhar|dabav|dabaav|pressure|pain|jakad\w*|ghabra\w*)\b/,
      /\bdard\b.{0,20}\b(?:seene|seena|sine|chhati|chati)\b/,
      /\bdil ka (?:daura|dora|dawra)\b/,
      /\b(?:dil|heart)\b.{0,20}\b(?:dard|dukh)\b/,
      /(?:सीने|सीना|छाती).{0,30}(?:दर्द|जकड़न|दबाव|भारी|जलन)/,
      /दिल का दौरा|हार्ट ?अटैक/
    ]},
    { category: "breathing", patterns: [
      new RegExp("\\b" + NEG + "\\b.{0,25}\\b(?:bre+a?th\\w*|get air|catch (?:my |his |her )?breath)"),
      /\bbre+a?th\w*\b.{0,20}\b(?:difficult\w*|hard|trouble|problem\w*|stopped|stops)\b/,
      /\b(?:not|stopped|stops|stop|barely)\s+bre+a?th\w*/,
      /\bshort(?:ness)? of breath\b|\bgasping\b/,
      /\b(?:severe|serious|sudden|extreme|acute)\s+(?:breathlessness|breathing)\b/,
      /\b(?:blue|bluish)\s+(?:lips|face|skin)\b|\blips?\b.{0,12}\bblue\b/,
      /\b(?:saans|sans|saas|swas|shwas|sanse)\b.{0,30}\b(?:nahi|nai|nhi|nahin|ruk|phool|phul|fool|tez|takleef|taklif|dikkat|mushkil|bhaari|bhari|atak|ghut)\w*/,
      /\bsuffocat\w*|\bchok(?:ing|ed)\b/,
      /\bwheez\w*\b.{0,15}\b(?:badly|severe\w*|so much|cant|cannot)\b|\b(?:badly|severely)\b.{0,10}\bwheez\w*/,
      /\b(?:cant|cannot|unable to) (?:speak|talk)\b.{0,30}\bwheez\w*/,
      /\b(?:dam|dum) ghut\w*/,
      /(?:सांस|साँस|सास).{0,30}(?:नहीं|नही|तकलीफ|दिक्कत|मुश्किल|फूल|रुक|घुट)/,
      /दम\s*घुट/
    ]},
    { category: "stroke", patterns: [
      /\b(?:face|mouth|smile|lip|lips)\b.{0,25}\b(?:droop\w*|drop\w*|crooked|lopsided|sagg\w*|uneven|numb\w*|twist\w*)\b/,
      /\bdroop\w*\s+(?:face|mouth|eye)\b|\bfacial\s+(?:droop\w*|weakness)\b/,
      /\bslurr\w*\b/,
      /\bsudden\w*\b.{0,25}\b(?:cant|cannot|unable to|loss of|lost)\b.{0,15}\b(?:speak|talk|see|vision|walk|move|balance)\b/,
      /\bone side\b.{0,20}\b(?:weak\w*|numb\w*|paraly\w*)\b/,
      /\b(?:sudden|suddenly)\b.{0,30}\b(?:weak\w*|numb\w*)\b.{0,20}\b(?:arm|leg|face|side)\b/,
      /\bcant\s+(?:lift|raise|move)\b.{0,15}\b(?:arm|leg)\b/,
      /\bparaly[sz]ed\b|\bparalysis\b/,
      /\b(?:having|had|got|suffering|think\w*|suspect\w*|possible|maybe|might be|looks like|seems like)\b.{0,15}\bstroke\b/,
      /\b(?:chehra|chehre|munh|muh|mooh)\b.{0,20}\b(?:tedha|teda|tedhi|latak\w*|sujan|sunn)\b/,
      /\bzubaan\b.{0,15}\b(?:lad\w*|atak\w*)\b|\b(?:bol|baat) nahi (?:pa|paa|sak)\w*/,
      /\blakwa\b|\blaqwa\b|\bek taraf\b.{0,20}\b(?:kamzor|sunn)\w*/,
      /लकवा|चेहरा\s*टेढ|मुंह\s*टेढ|जुबान\s*लड|ज़ुबान\s*लड/
    ]},
    { category: "overdose", patterns: [
      /\boverdos\w*/,
      /\b(?:took|taken|take|swallowed|ate|eaten|had|consumed|ingested|popped)\b.{0,25}\b(?:too many|too much|whole (?:strip|bottle|pack)|entire (?:strip|bottle|pack)|extra|double)\b.{0,25}\b(?:pill|tablet|capsule|medicine|medication|drug|paracetamol|crocin|dolo|sleeping)\w*/,
      /\b(?:pill|tablet|capsule|medicine)s?\b.{0,20}\b(?:too many|whole bottle)\b/,
      /\b(?:took|taken|swallowed|ate|eaten|popped|downed)\b.{0,15}\b(?:\d{2,}|dozens?|handful)\b.{0,10}\b(?:pills?|tablets?|capsules?)\b/,
      new RegExp("\\b(?:swallowed|drank|drunk|ate|eaten|ingested|consumed|licked|sipped|gulped)\\b.{0,40}\\b" + CAUSE + "\\b"),
      /\b(?:poisoned|poisoning)\b/,
      /\b(?:child|baby|toddler|kid|son|daughter|bacha|baccha|beta|beti)\b.{0,40}\b(?:drank|swallowed|ate|ingested)\b.{0,30}\b(?:something|unknown|medicines?|tablets?|pills?|capsules?|liquid|chemicals?)\b/,
      /\b(?:zeher|zahar|jahar|jehar|zehar|poison)\b.{0,25}\b(?:kha|khaya|khali|pi|piya|pee|pilaya|nigal|ghonta)\w*/,
      /\b(?:kha|pi|nigal)\w*\b.{0,20}\b(?:zeher|zahar|jahar)\b/,
      /\b(?:zyada|jyada|bahut|bohot|bahot)\b.{0,15}\b(?:goli|goliyan|goliya|dawai|dawa|tablet|tablets)\b.{0,15}\b(?:kha|le)\w*/,
      /\b(?:goli|goliyan|dawai|dawa|tablet)\w*\b.{0,15}\b(?:zyada|jyada|bahut)\b.{0,15}\b(?:kha|le)\w*/,
      /\b(?:keeda ?maar|keede ?maar|mitti ka tel|phenyl|harpic|kerosene|petrol|acid|dettol)\b.{0,25}\b(?:pi|piya|khaya|kha)\b/,
      /जहर.{0,20}(?:खा|पी|पिया|निगल)/,
      /ज्यादा\s*(?:गोलियां|गोलियाँ|दवा|दवाई|टैबलेट).{0,15}(?:खा|ले)/
    ]},
    { category: "allergy", patterns: [
      /\b(?:allerg\w*|anaphyla\w*|sting|stung|bitten|bite)\b.{0,50}\b(?:throat|tongue|bre+a?th\w*|swell\w*|swollen|wheez\w*|lips|face|hives|faint\w*|dizzy|closing)\b/,
      /\bthroat\b.{0,15}\b(?:clos\w*|tight\w*|swell\w*|swollen|constrict\w*)\b/,
      /\b(?:tongue|lips?|face)\b.{0,20}\b(?:swell\w*|swollen|puff\w*)\b/,
      /\bhives\b.{0,30}\b(?:all over|bre+a?th\w*|swell\w*|throat)\b/,
      /\b(?:gala|gale|galaa)\b.{0,25}\b(?:band|bhar|tight|sooj\w*|sujan|ghut\w*|ruk\w*|kas)\w*/,
      /\b(?:honth|hont|hothon|chehra|chehre|jeebh|zubaan|jibh|munh|muh)\b.{0,25}\b(?:sooj\w*|suj\w*|phool\w*|phul\w*)\b/,
      /\b(?:allergy|reaction)\b.{0,30}\b(?:saans|gala|sooj\w*|suj\w*)/,
      /गला.{0,20}(?:बंद|भर|सूज|घुट|जकड)/,
      /(?:होंठ|होठ|चेहरा|जीभ|ज़ुबान|जुबान).{0,20}(?:सूज|फूल)/
    ]},
    { category: "bleeding", patterns: [
      /\b(?:severe|heavy|profuse|uncontrol\w*|massive|non ?stop)\b.{0,20}\bbleed\w*/,
      /\bbleed\w*\b.{0,25}\b(?:wont|will not|not|cant|cannot|doesnt|does not)\s+stop/,
      /\bbleed\w*\b.{0,10}\b(?:non ?stop|continuously|constantly)\b/,
      /\bblood\b.{0,25}\b(?:wont|will not|not|cant|cannot|doesnt|does not)\s+(?:stop|clot)\b/,
      /\bbleed\w*\b.{0,15}\b(?:heavily|badly|a lot|profusely|too much|severely)\b|\bheavily bleed\w*/,
      /\bblood\b.{0,20}\b(?:pouring|gushing|streaming|everywhere|flowing)\b/,
      /\bsoak\w*\b.{0,15}\bblood\b|\bspurting\b|\bcoughing(?: up)? blood\b|\bvomit\w* blood\b/,
      /\bkhoon\b.{0,20}\b(?:nahi ruk\w*|beh raha|bah raha|behta)\b/,
      /खून.{0,20}(?:नहीं\s*रु|बह\s*रहा)/
    ]},
    { category: "unconscious", patterns: [
      /\b(?:unconscious|unresponsive|collapsed|passed out|blacked out)\b/,
      /\b(?:wont|will not|not|cant|cannot|unable to|doesnt|does not|isnt|is not)\s+(?:wake|waking|respond\w*)\b/,
      /\bseizure\w*|\bconvuls\w*|\bhaving a fit\b|\bmirgi\b|\bdaura pad\w*/,
      /\b(?:behosh|bebosh|behoshi)\b|\bhosh nahi\b|\b(?:nahi uth|uth nahi) (?:raha|rahi|rahe)\b|\bjaag nahi\b/,
      /बेहोश|होश\s*नहीं|मिर्गी|दौरा\s*पड/
    ]},
    { category: "snake", patterns: [
      /\b(?:snake|saanp|sanp)\b.{0,20}\b(?:bite|bit|bitten|kaat\w*|dasa\w*)\b/
    ]},
    { category: "selfharm", patterns: [
      /\bsuicid\w*|\bkill myself\b|\bend my life\b|\bend it all\b|\btake my own life\b|\bwant to die\b|\bdont want to live\b|\bno reason to live\b/,
      /\bself ?harm\w*|\bhurt myself\b|\bcut myself\b|\bharm myself\b|\bbetter off dead\b|\bwish i (?:was|were) dead\b/,
      /\bjaan de ?(?:na|dena|du|dunga|dungi)\b|\bmar jana chah\w*|\bmarna chah\w*|\bkhud ?kushi\b|\batmahatya\b|\bzindagi khatam\b|\bjeena nahi chah\w*|\bjeene ka mann nahi\b/,
      /\b(?:dont|do not|no longer) want to (?:be alive|exist|live anymore)\b|\b(?:thinking|thought|thoughts) (?:about|of) (?:ending (?:it|my life|everything)|dying|suicide)\b|\bending it all\b|\b(?:better|happier) (?:off )?without me\b|\bno point (?:in )?living\b|\bcant go on\b/,
      /\bmar jaun\b|\bmar jana chahiye\b|\bsab khatam kar\w*/,
      /आत्महत्या|खुदकुशी|मरना\s*चाह|जान\s*दे|जीना\s*नहीं\s*चाह/
    ]}
  ];

  /* ---------- guards that reduce obvious false matches ---------- */
  var NEG_BEFORE = /\b(?:no|without|never|not having|dont have|do not have|didnt have|doesnt have|havent had|free of)\s+(?:\w+\s+){0,2}$/;
  var SPAN_NEG = /\b(?:no|without|never|fine|normal|okay|ok)\b/;

  // Words that show the situation is happening now or to a specific person.
  var URGENCY = new RegExp(
    "\\b(?:right now|now|currently|just now|just|suddenly|immediately|urgent\\w*|emergency|help|please|asap|abhi|turant|jaldi|" +
    "at the moment|happening|ho raha|ho rahi|raha hai|rahi hai|rahe hain|am having|im having|i have|i feel|im feeling|i am feeling|" +
    "ive got|i got|i think i|i think im|mujhe|mere|meri|mera|he has|she has|he is|she is|they have|someone has|someone is|somebody is|" +
    "my (?:father|mother|dad|mom|mum|papa|mummy|baby|child|son|daughter|wife|husband|friend|brother|sister|grandfather|grandmother|" +
    "grandpa|grandma|dadaji|dadi|nana|nani)|cant|cannot)\\b|मुझे|मेरे|मेरी|मेरा|अभी|तुरंत"
  );

  var EDU = [
    /^(?:what|whats|which|why|how|when|can you explain|could you explain|please explain|explain|tell me about|define|meaning of|difference between)\b/,
    /\b(?:signs?|symptoms?|causes?|risk factors?|warning signs?|prevention|first aid|treatment)\s+(?:of|for)\b/,
    /\b(?:learn|learning|understand|awareness|educat\w*|general information|in general|essay|article|assignment|project|exam|homework|school|class|study|studying|research|presentation)\b/,
    /\b(?:matlab|meaning|lakshan|lakshano|karan|kaaran|ilaaj|bachav|jaankari|jankari)\b/
  ];
  var PAST = /\b(?:last (?:year|month|week)|(?:years?|months?|weeks?|days?) ago|yesterday|in the past|previously|used to|was diagnosed|history of)\b/;
  var NOW = /\b(?:still|again|now|today|tonight|currently)\b/;

  // spanCheck=false for self-harm: its phrases legitimately contain "no"/"without"
  // ("no reason to live", "better without me"), so only the words BEFORE the match count.
  function isNegated(text, idx, matched, spanCheck) {
    if (NEG_BEFORE.test(text.slice(Math.max(0, idx - 40), idx))) return true;
    return spanCheck !== false && SPAN_NEG.test(matched);
  }

  /**
   * detectEmergency(text) -> { emergency, category, also, reason }
   * emergency=true means: show emergency guidance, skip the AI.
   */
  function detectEmergency(raw) {
    var t = normalize(raw);
    if (!t) return { emergency: false, category: null, also: [], reason: "empty" };
    var cleaned = t.replace(/\bfood poisoning\b/g, " ").replace(/\b(?:heat|sun)\s*stroke\b/g, " ")
      .replace(/\bstroke of (?:luck|genius|midnight|brilliance|fate|bad luck)\b/g, " ")
      .replace(/\b(?:brush|back|breast|swim\w*|master|pen|key)\s*stroke\b/g, " ");
    var hits = [];
    GROUPS.forEach(function (g) {
      for (var i = 0; i < g.patterns.length; i++) {
        var m = g.patterns[i].exec(cleaned);
        if (m && !isNegated(cleaned, m.index, m[0], g.category !== "selfharm")) { hits.push(g.category); break; }
      }
    });
    if (!hits.length) return { emergency: false, category: null, also: [], reason: "no_match" };
    if (!URGENCY.test(cleaned)) {
      for (var j = 0; j < EDU.length; j++) {
        if (EDU[j].test(cleaned)) return { emergency: false, category: null, also: [], reason: "educational" };
      }
      if (PAST.test(cleaned) && !NOW.test(cleaned)) return { emergency: false, category: null, also: [], reason: "past_reference" };
    }
    var primary = hits[0];
    var also = hits.slice(1);
    return { emergency: true, category: primary, also: also, reason: "matched" };
  }

  /* ---------- medicine-dose requests ---------- */
  var DOSE_WORD = /\b(?:dose|doses|dosage|dosing|how much|how many|how often|mg|ml|milligram\w*|kitna|kitni|kitne|quantity|amount)\b/;
  var MED_WORD = /\b(?:paracetamol|acetaminophen|crocin|dolo|calpol|ibuprofen|brufen|combiflam|aspirin|disprin|diclofenac|amoxicillin|azithromycin|antibiotic\w*|steroid\w*|cetirizine|antihistamine|cough syrup|syrup|tablet\w*|pill|pills|capsule\w*|medicine\w*|medication\w*|drug\w*|dawai|dawa|goli|goliyan|injection\w*|insulin|metformin)\b/;

  function isDosageRequest(raw) {
    var t = normalize(raw);
    return DOSE_WORD.test(t) && MED_WORD.test(t);
  }

  /* ---------- messages (proposed wording; needs clinical review) ---------- */
  var CALL = "This may be a medical emergency. Call 112 now (India's national emergency number) or go to the nearest emergency department. Do not wait for this chat. If you can, ask someone nearby to stay with the person.";
  var STEPS = {
    chest: "Stop what you are doing and sit or lie down. Do not drive yourself.",
    breathing: "Sit upright if you can and loosen tight clothing.",
    stroke: "Note the time the symptoms started and tell the emergency team. Do not give food, drink, or medicine.",
    overdose: "Keep the container or packet to show the emergency team. Do not try to make the person vomit.",
    allergy: "If the person has a prescribed adrenaline auto-injector and knows how to use it, use it as directed. Still call 112.",
    bleeding: "Press firmly on the wound with a clean cloth and keep pressing until help arrives.",
    unconscious: "Tell the emergency operator what is happening; they can guide you step by step.",
    snake: "Keep the person still and calm. Do not cut the wound or try to suck out venom."
  };
  var LIMIT = "HealthSaathi AI is not a medical service and can miss emergencies. If in doubt, call 112.";
  var SELFHARM_MSG = "I'm really sorry you are going through this. You matter. If you might act on these thoughts or are in immediate danger, call 112 now or go to the nearest emergency department. If you can, tell someone you trust, like a family member or friend, and ask them to stay with you. Talking with a mental health professional can also help. " + LIMIT;
  var SELFHARM_ALSO = " If you are also having thoughts of harming yourself, please tell the emergency team or someone you trust right now.";

  function emergencyMessage(category, also) {
    if (category === "selfharm") return SELFHARM_MSG;
    var steps = STEPS[category] ? " " + STEPS[category] : "";
    var extra = also && also.indexOf("selfharm") !== -1 ? SELFHARM_ALSO : "";
    return CALL + steps + extra + " " + LIMIT;
  }

  function dosageMessage() {
    return "I can't give medicine doses. The right amount depends on age, weight, health conditions and the exact product, especially for children, pregnant women and older adults. Please check the label, or ask a pharmacist or your doctor. If someone has taken too much medicine, call 112 now.";
  }

  /* ---------- basic offline tips (NOT AI) ---------- */
  var LOCAL = [
    { kind: "hydration", re: /\b(?:water|hydrat\w*|thirst\w*|dehydrat\w*)\b/, text: "For many people, drinking water regularly throughout the day is a useful habit. Needs vary with activity, climate, and health conditions. Follow your clinician's advice if you have fluid restrictions." },
    { kind: "sleep", re: /\b(?:sleep\w*|insomnia|tired|fatigue|nap|bedtime)\b/, text: "A consistent sleep and wake time, a calm wind-down routine, and reducing caffeine late in the day may help sleep. Persistent or severe sleep difficulties are worth discussing with a healthcare professional." },
    { kind: "stress", re: /\b(?:stress\w*|anxi\w*|relax\w*|worr\w*|overwhelm\w*|tension)\b/, text: "You could try a brief pause: breathe slowly and comfortably, relax your shoulders, or take a short walk if safe. If stress or anxiety is persistent or overwhelming, consider speaking with a qualified professional." },
    { kind: "nutrition", re: /\b(?:food|foods|diet|nutrition\w*|eat|eating|meal|meals|protein|vitamin\w*|calories|breakfast|lunch|dinner)\b/, text: "A varied eating pattern with vegetables, fruit, whole grains, protein sources, and enough fluids can support general wellbeing. Specific needs vary, so ask a qualified clinician or dietitian for personal advice." }
  ];
  var LOCAL_FALLBACK = "I can share basic tips about hydration, sleep, stress, and nutrition, but I can't diagnose conditions or recommend treatment. For personal medical concerns, please consult a qualified healthcare professional.";

  function localReply(raw) {
    var t = normalize(raw);
    for (var i = 0; i < LOCAL.length; i++) {
      if (LOCAL[i].re.test(t)) return { kind: LOCAL[i].kind, text: LOCAL[i].text };
    }
    return { kind: "generic", text: LOCAL_FALLBACK };
  }

  return {
    normalize: normalize,
    detectEmergency: detectEmergency,
    emergencyMessage: emergencyMessage,
    isDosageRequest: isDosageRequest,
    dosageMessage: dosageMessage,
    localReply: localReply,
    LIMIT: LIMIT
  };
});
