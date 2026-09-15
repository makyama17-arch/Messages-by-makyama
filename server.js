const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");

const admin = require("firebase-admin");

const app = express();

const PORT =
  process.env.PORT || 3000;

/* =====================================================
MIDDLEWARE
===================================================== */

app.use(
  express.json({
    limit: "5mb"
  })
);

app.use(cookieParser());

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

/* =====================================================
FIREBASE
===================================================== */

let db = null;

function initFirebase() {

  if (db) return db;

  const serviceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT;

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL;

  if (
    !serviceAccount ||
    !databaseURL
  ) {

    return null;

  }

  try {

    const credentials =
      JSON.parse(
        serviceAccount
      );

    if (!admin.apps.length) {

      admin.initializeApp({

        credential:
          admin.credential.cert(
            credentials
          ),

        databaseURL

      });

    }

    db =
      admin.database();

    return db;

  } catch (error) {

    console.error(
      "Firebase error:",
      error.message
    );

    return null;

  }

}

async function firebaseGet(
  ref
) {

  const database =
    initFirebase();

  if (!database) {

    throw new Error(
      "Firebase is not configured."
    );

  }

  const snapshot =
    await database
      .ref(ref)
      .once("value");

  return snapshot.val();

}

async function firebaseSet(
  ref,
  value
) {

  const database =
    initFirebase();

  if (!database) {

    throw new Error(
      "Firebase is not configured."
    );

  }

  await database
    .ref(ref)
    .set(value);

}

async function increment(
  ref
) {

  const database =
    initFirebase();

  if (!database) return;

  await database
    .ref(ref)
    .transaction(
      current => {

        return (
          Number(current) || 0
        ) + 1;

      }
    );

}

/* =====================================================
LANGUAGE SYSTEM
===================================================== */

/*
  The website can send:

  ?lang=en
  ?lang=sw
  ?lang=fr
  ?lang=ar

  or use the Accept-Language browser header.

  Translation itself is performed server-side.

  The provider URL and optional API key are kept
  in Render Environment Variables.

  Recommended variables:

  TRANSLATION_API_URL
  TRANSLATION_API_KEY
  DEFAULT_LANGUAGE

  Example:

  TRANSLATION_API_URL=https://libretranslate.com/translate

  If the provider does not require a key,
  TRANSLATION_API_KEY can be left empty.
*/

const DEFAULT_LANGUAGE =
  String(
    process.env.DEFAULT_LANGUAGE ||
    "en"
  )
    .trim()
    .toLowerCase();

/*
  A broad list for the language selector.

  The backend does not hard-limit translation
  to this list. If the selected translation
  provider supports another language code,
  it can still be requested.
*/

const supportedLanguages = [

  {
    code: "en",
    name: "English",
    nativeName: "English",
    rtl: false
  },

  {
    code: "sw",
    name: "Swahili",
    nativeName: "Kiswahili",
    rtl: false
  },

  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    rtl: false
  },

  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    rtl: false
  },

  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    rtl: false
  },

  {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    rtl: false
  },

  {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    rtl: false
  },

  {
    code: "nl",
    name: "Dutch",
    nativeName: "Nederlands",
    rtl: false
  },

  {
    code: "pl",
    name: "Polish",
    nativeName: "Polski",
    rtl: false
  },

  {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
    rtl: false
  },

  {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    rtl: false
  },

  {
    code: "uk",
    name: "Ukrainian",
    nativeName: "Українська",
    rtl: false
  },

  {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    rtl: true
  },

  {
    code: "fa",
    name: "Persian",
    nativeName: "فارسی",
    rtl: true
  },

  {
    code: "he",
    name: "Hebrew",
    nativeName: "עברית",
    rtl: true
  },

  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    rtl: false
  },

  {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    rtl: false
  },

  {
    code: "ur",
    name: "Urdu",
    nativeName: "اردو",
    rtl: true
  },

  {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    rtl: false
  },

  {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    rtl: false
  },

  {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    rtl: false
  },

  {
    code: "id",
    name: "Indonesian",
    nativeName: "Bahasa Indonesia",
    rtl: false
  },

  {
    code: "ms",
    name: "Malay",
    nativeName: "Bahasa Melayu",
    rtl: false
  },

  {
    code: "vi",
    name: "Vietnamese",
    nativeName: "Tiếng Việt",
    rtl: false
  },

  {
    code: "th",
    name: "Thai",
    nativeName: "ไทย",
    rtl: false
  },

  {
    code: "fil",
    name: "Filipino",
    nativeName: "Filipino",
    rtl: false
  },

  {
    code: "am",
    name: "Amharic",
    nativeName: "አማርኛ",
    rtl: false
  },

  {
    code: "ha",
    name: "Hausa",
    nativeName: "Hausa",
    rtl: false
  },

  {
    code: "yo",
    name: "Yoruba",
    nativeName: "Yorùbá",
    rtl: false
  },

  {
    code: "zu",
    name: "Zulu",
    nativeName: "isiZulu",
    rtl: false
  },

  {
    code: "af",
    name: "Afrikaans",
    nativeName: "Afrikaans",
    rtl: false
  },

  {
    code: "so",
    name: "Somali",
    nativeName: "Soomaali",
    rtl: false
  },

  {
    code: "ro",
    name: "Romanian",
    nativeName: "Română",
    rtl: false
  },

  {
    code: "cs",
    name: "Czech",
    nativeName: "Čeština",
    rtl: false
  },

  {
    code: "sk",
    name: "Slovak",
    nativeName: "Slovenčina",
    rtl: false
  },

  {
    code: "el",
    name: "Greek",
    nativeName: "Ελληνικά",
    rtl: false
  },

  {
    code: "hu",
    name: "Hungarian",
    nativeName: "Magyar",
    rtl: false
  },

  {
    code: "sv",
    name: "Swedish",
    nativeName: "Svenska",
    rtl: false
  },

  {
    code: "da",
    name: "Danish",
    nativeName: "Dansk",
    rtl: false
  },

  {
    code: "no",
    name: "Norwegian",
    nativeName: "Norsk",
    rtl: false
  },

  {
    code: "fi",
    name: "Finnish",
    nativeName: "Suomi",
    rtl: false
  },

  {
    code: "bg",
    name: "Bulgarian",
    nativeName: "Български",
    rtl: false
  },

  {
    code: "sr",
    name: "Serbian",
    nativeName: "Српски",
    rtl: false
  },

  {
    code: "hr",
    name: "Croatian",
    nativeName: "Hrvatski",
    rtl: false
  },

  {
    code: "sl",
    name: "Slovenian",
    nativeName: "Slovenščina",
    rtl: false
  },

  {
    code: "et",
    name: "Estonian",
    nativeName: "Eesti",
    rtl: false
  },

  {
    code: "lv",
    name: "Latvian",
    nativeName: "Latviešu",
    rtl: false
  },

  {
    code: "lt",
    name: "Lithuanian",
    nativeName: "Lietuvių",
    rtl: false
  }

];

function normalizeLanguage(
  language
) {

  let value =
    String(
      language || ""
    )
      .trim()
      .toLowerCase();

  if (!value) {

    return DEFAULT_LANGUAGE;

  }

  /*
    Convert common regional codes:

    en-US -> en
    en-GB -> en
    sw-TZ -> sw
    fr-FR -> fr
  */

  if (
    value.includes("-")
  ) {

    value =
      value.split("-")[0];

  }

  if (
    value.includes("_")
  ) {

    value =
      value.split("_")[0];

  }

  return value;

}

function getLanguageInfo(
  language
) {

  const code =
    normalizeLanguage(
      language
    );

  return (
    supportedLanguages.find(
      item =>
        item.code === code
    ) ||
    {

      code,

      name: code,

      nativeName: code,

      rtl: false

    }
  );

}

function detectBrowserLanguage(
  req
) {

  const header =
    String(
      req.headers[
        "accept-language"
      ] || ""
    );

  if (!header) {

    return DEFAULT_LANGUAGE;

  }

  const first =
    header
      .split(",")[0]
      .split(";")[0]
      .trim();

  return normalizeLanguage(
    first
  );

}

/* =====================================================
LANGUAGE API
===================================================== */

app.get(
  "/api/languages",
  (req, res) => {

    res.json({

      ok: true,

      defaultLanguage:
        DEFAULT_LANGUAGE,

      languages:
        supportedLanguages

    });

  }
);

/* =====================================================
TRANSLATION CACHE
===================================================== */

const translationMemory =
  new Map();

const translationMemoryLimit =
  5000;

function createTranslationCacheKey(
  source,
  target,
  text
) {

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({

        source,
        target,
        text

      })
    )
    .digest("hex");

}

function cleanTranslationCache() {

  if (
    translationMemory.size <=
    translationMemoryLimit
  ) {

    return;

  }

  const firstKey =
    translationMemory
      .keys()
      .next()
      .value;

  if (firstKey) {

    translationMemory.delete(
      firstKey
    );

  }

}

/* =====================================================
TRANSLATION PROVIDER
===================================================== */

async function translateWithProvider(
  text,
  sourceLanguage,
  targetLanguage
) {

  const apiUrl =
    String(
      process.env.TRANSLATION_API_URL ||
      "https://libretranslate.com/translate"
    ).trim();

  const apiKey =
    String(
      process.env.TRANSLATION_API_KEY ||
      ""
    ).trim();

  const body = {

    q:
      text,

    source:
      sourceLanguage,

    target:
      targetLanguage,

    format:
      "text"

  };

  if (apiKey) {

    body.api_key =
      apiKey;

  }

  const response =
    await fetch(
      apiUrl,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Accept":
            "application/json"

        },

        body:
          JSON.stringify(
            body
          )

      }
    );

  const responseText =
    await response.text();

  let data = null;

  try {

    data =
      JSON.parse(
        responseText
      );

  } catch (
    error
  ) {

    data = null;

  }

  if (!response.ok) {

    throw new Error(

      data?.error ||
      data?.message ||
      `Translation provider returned HTTP ${response.status}.`

    );

  }

  const translated =
    String(
      data?.translatedText ||
      data?.translation ||
      ""
    ).trim();

  if (!translated) {

    throw new Error(
      "Translation provider returned an empty translation."
    );

  }

  return translated;

}

/* =====================================================
TRANSLATE TEXT
===================================================== */

async function translateText(
  text,
  sourceLanguage,
  targetLanguage
) {

  const original =
    String(
      text || ""
    );

  const source =
    normalizeLanguage(
      sourceLanguage
    );

  const target =
    normalizeLanguage(
      targetLanguage
    );

  if (!original.trim()) {

    return original;

  }

  if (
    source === target
  ) {

    return original;

  }

  const cacheKey =
    createTranslationCacheKey(
      source,
      target,
      original
    );

  const cached =
    translationMemory.get(
      cacheKey
    );

  if (cached) {

    return cached;

  }

  /*
    Firebase translation cache.

    This prevents repeated API calls
    for the same text.
  */

  const database =
    initFirebase();

  if (database) {

    try {

      const firebaseKey =
        `translationCache/${source}/${target}/${cacheKey}`;

      const firebaseCached =
        await firebaseGet(
          firebaseKey
        );

      if (
        typeof firebaseCached ===
        "string" &&
        firebaseCached.trim()
      ) {

        translationMemory.set(
          cacheKey,
          firebaseCached
        );

        cleanTranslationCache();

        return firebaseCached;

      }

    } catch (
      error
    ) {

      console.warn(
        "Firebase translation cache read failed:",
        error.message
      );

    }

  }

  /*
    Ask the translation provider.
  */

  const translated =
    await translateWithProvider(
      original,
      source,
      target
    );

  translationMemory.set(
    cacheKey,
    translated
  );

  cleanTranslationCache();

  /*
    Save translated text to Firebase.
  */

  if (database) {

    try {

      await firebaseSet(

        `translationCache/${source}/${target}/${cacheKey}`,

        translated

      );

    } catch (
      error
    ) {

      console.warn(
        "Firebase translation cache write failed:",
        error.message
      );

    }

  }

  return translated;

}

/* =====================================================
TRANSLATION ENDPOINT
===================================================== */

app.post(
  "/api/translate",
  async (req, res) => {

    try {

      const text =
        String(
          req.body.text || ""
        );

      const source =
        normalizeLanguage(
          req.body.source ||
          DEFAULT_LANGUAGE
        );

      const target =
        normalizeLanguage(
          req.body.target ||
          DEFAULT_LANGUAGE
        );

      if (!text.trim()) {

        return res.status(400).json({

          error:
            "Text is required."

        });

      }

      if (
        text.length >
        10000
      ) {

        return res.status(400).json({

          error:
            "Text is too long. Maximum 10000 characters per request."

        });

      }

      const translated =
        await translateText(
          text,
          source,
          target
        );

      const languageInfo =
        getLanguageInfo(
          target
        );

      res.json({

        ok: true,

        source,

        target,

        rtl:
          Boolean(
            languageInfo.rtl
          ),

        original:
          text,

        translated

      });

    } catch (error) {

      console.error(
        "Translation error:",
        error.message
      );

      res.status(500).json({

        error:
          error.message ||
          "Unable to translate text."

      });

    }

  }
);

/* =====================================================
TRANSLATE MANY TEXTS
===================================================== */

/*
  The frontend can send many UI strings
  in one request.

  Example:

  {
    source: "sw",
    target: "fr",
    texts: {
      search: "Tafuta",
      share: "Shiriki",
      contact: "Wasiliana nasi"
    }
  }

  The response keeps the same keys.
*/

app.post(
  "/api/translate/batch",
  async (req, res) => {

    try {

      const source =
        normalizeLanguage(
          req.body.source ||
          DEFAULT_LANGUAGE
        );

      const target =
        normalizeLanguage(
          req.body.target ||
          DEFAULT_LANGUAGE
        );

      const texts =
        req.body.texts;

      if (
        !texts ||
        typeof texts !==
        "object" ||
        Array.isArray(texts)
      ) {

        return res.status(400).json({

          error:
            "texts must be an object."

        });

      }

      const keys =
        Object.keys(
          texts
        );

      if (
        keys.length >
        100
      ) {

        return res.status(400).json({

          error:
            "Maximum 100 texts per batch."

        });

      }

      const result = {};

      /*
        Translate sequentially.

        This is intentionally controlled
        to avoid sending a huge number
        of simultaneous requests.
      */

      for (
        const key of keys
      ) {

        const text =
          String(
            texts[key] || ""
          );

        if (!text.trim()) {

          result[key] =
            text;

          continue;

        }

        result[key] =
          await translateText(
            text,
            source,
            target
          );

      }

      const languageInfo =
        getLanguageInfo(
          target
        );

      res.json({

        ok: true,

        source,

        target,

        rtl:
          Boolean(
            languageInfo.rtl
          ),

        translations:
          result

      });

    } catch (error) {

      console.error(
        "Batch translation error:",
        error.message
      );

      res.status(500).json({

        error:
          error.message ||
          "Unable to translate texts."

      });

    }

  }
);

/* =====================================================
MAILTRAP EMAIL
===================================================== */

const MAILTRAP_API_URL =
  "https://send.api.mailtrap.io/api/send";

function normalizeEmail(
  email
) {

  return String(
    email || ""
  )
    .trim()
    .toLowerCase();

}

function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);

}

function hashVerificationValue(
  value
) {

  return crypto
    .createHash("sha256")
    .update(
      String(value)
    )
    .digest("hex");

}

function generateVerificationCode() {

  return String(
    crypto.randomInt(
      100000,
      1000000
    )
  );

}

async function sendVerificationEmail(
  email,
  code
) {

  const token =
    process.env.MAILTRAP_API_TOKEN;

  const fromEmail =
    process.env.MAILTRAP_FROM_EMAIL;

  const fromName =
    process.env.MAILTRAP_FROM_NAME ||
    "MAKYAMA Messages";

  if (!token) {

    throw new Error(
      "MAILTRAP_API_TOKEN is not configured on Render."
    );

  }

  if (!fromEmail) {

    throw new Error(
      "MAILTRAP_FROM_EMAIL is not configured on Render."
    );

  }

  const response =
    await fetch(
      MAILTRAP_API_URL,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Api-Token":
            token

        },

        body:
          JSON.stringify({

            from: {

              email:
                fromEmail,

              name:
                fromName

            },

            to: [

              {

                email

              }

            ],

            subject:
              "MAKYAMA Verification Code",

            text:
              `Your MAKYAMA verification code is ${code}. This code expires in 10 minutes.`,

            html: `

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
MAKYAMA Verification
</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#07101f;
    font-family:Arial,Helvetica,sans-serif;
  "
>

<div
  style="
    max-width:520px;
    margin:40px auto;
    padding:30px 22px;
    background:#0d1729;
    border-radius:18px;
    color:#ffffff;
    text-align:center;
  "
>

<div
  style="
    font-size:22px;
    font-weight:800;
    letter-spacing:1px;
    margin-bottom:10px;
  "
>
MAKYAMA MESSAGES
</div>

<div
  style="
    font-size:16px;
    color:#b8c4d8;
    margin-bottom:24px;
  "
>
Email Verification
</div>

<div
  style="
    display:inline-block;
    padding:16px 24px;
    border-radius:14px;
    background:#16243c;
    font-size:32px;
    font-weight:800;
    letter-spacing:8px;
    color:#ffffff;
  "
>
${code}
</div>

<p
  style="
    color:#b8c4d8;
    font-size:14px;
    line-height:1.6;
    margin-top:24px;
  "
>
This verification code expires in
<strong>10 minutes</strong>.
</p>

<p
  style="
    color:#71809a;
    font-size:12px;
    margin-top:30px;
  "
>
If you did not request this code,
you can safely ignore this email.
</p>

<div
  style="
    margin-top:24px;
    color:#66758d;
    font-size:11px;
  "
>
makyama.pntr.dev
</div>

</div>

</body>

</html>

`

          })

      }
    );

  const responseText =
    await response.text();

  let data = null;

  try {

    data =
      JSON.parse(
        responseText
      );

  } catch (
    error
  ) {

    data = null;

  }

  if (!response.ok) {

    console.error(
      "Mailtrap error:",
      response.status,
      responseText
    );

    throw new Error(
      data?.errors?.[0]?.message ||
      data?.message ||
      `Mailtrap request failed with status ${response.status}.`
    );

  }

  return data;

}

/* =====================================================
EMAIL VERIFICATION
===================================================== */

const verificationRateLimit =
  new Map();

const verificationCooldown =
  60 *
  1000;

const verificationExpiry =
  10 *
  60 *
  1000;

const verificationMaxAttempts =
  5;

function getVerificationKey(
  email
) {

  return hashVerificationValue(
    normalizeEmail(
      email
    )
  );

}

/* =====================================================
SEND VERIFICATION CODE
===================================================== */

app.post(
  "/api/auth/send-code",
  async (req, res) => {

    try {

      const email =
        normalizeEmail(
          req.body.email
        );

      if (
        !isValidEmail(
          email
        )
      ) {

        return res.status(400).json({

          error:
            "Please enter a valid email address."

        });

      }

      const now =
        Date.now();

      const rateKey =
        getVerificationKey(
          email
        );

      const previousRequest =
        verificationRateLimit.get(
          rateKey
        );

      if (
        previousRequest &&
        now -
        previousRequest <
        verificationCooldown
      ) {

        const remaining =
          Math.ceil(

            (
              verificationCooldown -
              (
                now -
                previousRequest
              )
            ) /
            1000

          );

        return res.status(429).json({

          error:
            `Please wait ${remaining} seconds before requesting another code.`

        });

      }

      const code =
        generateVerificationCode();

      const codeHash =
        hashVerificationValue(
          code
        );

      const verificationData = {

        email,

        codeHash,

        expiresAt:
          now +
          verificationExpiry,

        attempts: 0,

        createdAt:
          now

      };

      await firebaseSet(

        `emailVerifications/${rateKey}`,

        verificationData

      );

      try {

        await sendVerificationEmail(
          email,
          code
        );

      } catch (
        emailError
      ) {

        await firebaseSet(

          `emailVerifications/${rateKey}`,

          null

        );

        throw emailError;

      }

      verificationRateLimit.set(
        rateKey,
        now
      );

      res.json({

        ok: true,

        message:
          "Verification code sent to your email.",

        expiresIn:
          verificationExpiry

      });

    } catch (error) {

      console.error(
        "Send verification code error:",
        error.message
      );

      res.status(500).json({

        error:
          error.message ||
          "Unable to send verification code."

      });

    }

  }
);

/* =====================================================
VERIFY CODE
===================================================== */

app.post(
  "/api/auth/verify-code",
  async (req, res) => {

    try {

      const email =
        normalizeEmail(
          req.body.email
        );

      const code =
        String(
          req.body.code || ""
        )
        .trim();

      if (
        !isValidEmail(
          email
        )
      ) {

        return res.status(400).json({

          error:
            "Invalid email address."

        });

      }

      if (
        !/^\d{6}$/.test(
          code
        )
      ) {

        return res.status(400).json({

          error:
            "Verification code must contain 6 digits."

        });

      }

      const rateKey =
        getVerificationKey(
          email
        );

      const verification =
        await firebaseGet(

          `emailVerifications/${rateKey}`

        );

      if (!verification) {

        return res.status(400).json({

          error:
            "No active verification code found. Please request a new code."

        });

      }

      if (
        Number(
          verification.expiresAt
        ) <
        Date.now()
      ) {

        await firebaseSet(

          `emailVerifications/${rateKey}`,

          null

        );

        return res.status(400).json({

          error:
            "This verification code has expired. Please request a new code."

        });

      }

      const attempts =
        Number(
          verification.attempts || 0
        );

      if (
        attempts >=
        verificationMaxAttempts
      ) {

        await firebaseSet(

          `emailVerifications/${rateKey}`,

          null

        );

        return res.status(429).json({

          error:
            "Too many incorrect attempts. Please request a new code."

        });

      }

      const submittedHash =
        hashVerificationValue(
          code
        );

      const storedHash =
        String(
          verification.codeHash ||
          ""
        );

      const hashesMatch =
        submittedHash.length ===
          storedHash.length &&
        crypto.timingSafeEqual(
          Buffer.from(
            submittedHash
          ),
          Buffer.from(
            storedHash
          )
        );

      if (
        !hashesMatch
      ) {

        await firebaseSet(

          `emailVerifications/${rateKey}/attempts`,

          attempts + 1

        );

        const remaining =
          Math.max(

            0,

            verificationMaxAttempts -
            (
              attempts + 1
            )

          );

        return res.status(400).json({

          error:
            remaining > 0

              ? `Incorrect verification code. ${remaining} attempts remaining.`

              : "Too many incorrect attempts. Please request a new code."

        });

      }

      await firebaseSet(

        `emailVerifications/${rateKey}`,

        null

      );

      res.json({

        ok: true,

        verified: true,

        email,

        message:
          "Email verified successfully."

      });

    } catch (error) {

      console.error(
        "Verify code error:",
        error.message
      );

      res.status(500).json({

        error:
          error.message ||
          "Unable to verify code."

      });

    }

  }
);

/* =====================================================
ADMIN SESSION
===================================================== */

const adminSessions =
  new Map();

function requireAdmin(
  req,
  res,
  next
) {

  const token =
    req.cookies.makyama_admin;

  if (!token) {

    return res.status(401).json({

      error:
        "Admin login required."

    });

  }

  const session =
    adminSessions.get(
      token
    );

  if (!session) {

    return res.status(401).json({

      error:
        "Invalid admin session."

    });

  }

  if (
    session.expiresAt <
    Date.now()
  ) {

    adminSessions.delete(
      token
    );

    return res.status(401).json({

      error:
        "Admin session expired."

    });

  }

  next();

}

/* =====================================================
HEALTH
===================================================== */

app.get(
  "/health",
  (req, res) => {

    res.json({

      ok: true,

      server:
        "MAKYAMA MESSAGE SERVER",

      firebase:
        Boolean(
          initFirebase()
        ),

      mailtrap:
        Boolean(
          process.env.MAILTRAP_API_TOKEN
        ),

      mailtrapFromEmail:
        Boolean(
          process.env.MAILTRAP_FROM_EMAIL
        ),

      translation:
        Boolean(
          process.env.TRANSLATION_API_URL
        ),

      translationApiKey:
        Boolean(
          process.env.TRANSLATION_API_KEY
        ),

      defaultLanguage:
        DEFAULT_LANGUAGE,

      time:
        new Date().toISOString()

    });

  }
);

/* =====================================================
ADMIN LOGIN
===================================================== */

app.post(
  "/api/admin/login",
  (req, res) => {

    const username =
      String(
        req.body.username || ""
      );

    const password =
      String(
        req.body.password || ""
      );

    const correctUsername =
      process.env.ADMIN_USERNAME;

    const correctPassword =
      process.env.ADMIN_PASSWORD;

    if (
      !correctUsername ||
      !correctPassword
    ) {

      return res.status(500).json({

        error:
          "Admin credentials are not configured on Render."

      });

    }

    if (
      username !==
        correctUsername ||
      password !==
        correctPassword
    ) {

      return res.status(401).json({

        error:
          "Invalid username or password."

      });

    }

    const token =
      crypto
        .randomBytes(32)
        .toString("hex");

    adminSessions.set(
      token,
      {

        username,

        expiresAt:
          Date.now() +
          12 *
          60 *
          60 *
          1000

      }
    );

    res.cookie(
      "makyama_admin",
      token,
      {

        httpOnly: true,

        sameSite: "lax",

        secure:
          process.env.NODE_ENV ===
          "production",

        maxAge:
          12 *
          60 *
          60 *
          1000

      }
    );

    res.json({

      ok: true,

      message:
        "Admin login successful."

    });

  }
);

app.get(
  "/api/admin/me",
  requireAdmin,
  (req, res) => {

    res.json({

      ok: true,

      username:
        process.env.ADMIN_USERNAME

    });

  }
);

app.post(
  "/api/admin/logout",
  requireAdmin,
  (req, res) => {

    const token =
      req.cookies.makyama_admin;

    adminSessions.delete(
      token
    );

    res.clearCookie(
      "makyama_admin"
    );

    res.json({

      ok: true

    });

  }
);

/* =====================================================
PUBLIC TEMPLATES
===================================================== */

app.get(
  "/api/templates",
  async (req, res) => {

    try {

      const data =
        await firebaseGet(
          "templates"
        );

      const templates =
        Object.values(
          data || {}
        )

        .filter(
          template => {

            return (
              template &&
              template.published === true
            );

          }
        )

        .map(
          template => ({

            id:
              template.id,

            title:
              template.title,

            category:
              template.category,

            thumbnail:
              template.thumbnail ||
              "",

            nameRequired:
              Boolean(
                template.nameRequired
              ),

            views:
              Number(
                template.views || 0
              ),

            likes:
              Number(
                template.likes || 0
              ),

            dislikes:
              Number(
                template.dislikes || 0
              )

          })
        );

      res.json(
        templates
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
SINGLE TEMPLATE
===================================================== */

app.get(
  "/api/templates/:id",
  async (req, res) => {

    try {

      const id =
        req.params.id;

      const template =
        await firebaseGet(
          `templates/${id}`
        );

      if (
        !template ||
        template.published !== true
      ) {

        return res.status(404).json({

          error:
            "Template not found."

        });

      }

      await increment(
        `templates/${id}/views`
      );

      await increment(
        "stats/totalViews"
      );

      res.json({

        ...template,

        likes:
          Number(
            template.likes || 0
          ),

        dislikes:
          Number(
            template.dislikes || 0
          )

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
LIKE / DISLIKE
===================================================== */

app.post(
  "/api/templates/:id/reaction",
  async (req, res) => {

    try {

      const id =
        String(
          req.params.id || ""
        ).trim();

      const reaction =
        String(
          req.body.reaction || ""
        ).trim();

      const previous =
        String(
          req.body.previous || ""
        ).trim();

      if (
        !id ||
        ![
          "like",
          "dislike",
          ""
        ].includes(
          reaction
        ) ||
        ![
          "like",
          "dislike",
          ""
        ].includes(
          previous
        )
      ) {

        return res.status(400).json({

          error:
            "Invalid reaction."

        });

      }

      const database =
        initFirebase();

      if (!database) {

        throw new Error(
          "Firebase is not configured."
        );

      }

      const template =
        await firebaseGet(
          `templates/${id}`
        );

      if (
        !template ||
        template.published !== true
      ) {

        return res.status(404).json({

          error:
            "Template not found."

        });

      }

      let likes =
        Number(
          template.likes || 0
        );

      let dislikes =
        Number(
          template.dislikes || 0
        );

      if (
        reaction === previous
      ) {

        return res.json({

          ok: true,

          likes,

          dislikes,

          reaction

        });

      }

      if (
        previous === "like"
      ) {

        likes =
          Math.max(
            0,
            likes - 1
          );

      }

      if (
        previous === "dislike"
      ) {

        dislikes =
          Math.max(
            0,
            dislikes - 1
          );

      }

      if (
        reaction === "like"
      ) {

        likes++;

      }

      if (
        reaction === "dislike"
      ) {

        dislikes++;

      }

      await database
        .ref(
          `templates/${id}/likes`
        )
        .set(
          likes
        );

      await database
        .ref(
          `templates/${id}/dislikes`
        )
        .set(
          dislikes
        );

      res.json({

        ok: true,

        likes,

        dislikes,

        reaction

      });

    } catch (error) {

      console.error(
        "Reaction error:",
        error.message
      );

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
ADMIN TEMPLATES
===================================================== */

app.get(
  "/api/admin/templates",
  requireAdmin,
  async (req, res) => {

    try {

      const data =
        await firebaseGet(
          "templates"
        );

      res.json(
        Object.values(
          data || {}
        )
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

app.post(
  "/api/admin/templates",
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        crypto.randomUUID();

      const title =
        String(
          req.body.title || ""
        ).trim();

      const category =
        String(
          req.body.category ||
          "Other"
        ).trim();

      const html =
        String(
          req.body.html || ""
        );

      const thumbnail =
        String(
          req.body.thumbnail || ""
        );

      const nameRequired =
        Boolean(
          req.body.nameRequired
        );

      const published =
        Boolean(
          req.body.published
        );

      if (
        !title ||
        !html
      ) {

        return res.status(400).json({

          error:
            "Title and HTML are required."

        });

      }

      const template = {

        id,

        title,

        category,

        html,

        thumbnail,

        nameRequired,

        published,

        views: 0,

        likes: 0,

        dislikes: 0,

        createdAt:
          Date.now(),

        updatedAt:
          Date.now()

      };

      await firebaseSet(
        `templates/${id}`,
        template
      );

      res.json({

        ok: true,

        template

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

app.put(
  "/api/admin/templates/:id",
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        req.params.id;

      const old =
        await firebaseGet(
          `templates/${id}`
        );

      if (!old) {

        return res.status(404).json({

          error:
            "Template not found."

        });

      }

      const updated = {

        ...old,

        title:
          String(
            req.body.title ??
            old.title ??
            ""
          ).trim(),

        category:
          String(
            req.body.category ??
            old.category ??
            "Other"
          ).trim(),

        html:
          String(
            req.body.html ??
            old.html ??
            ""
          ),

        thumbnail:
          String(
            req.body.thumbnail ??
            old.thumbnail ??
            ""
          ),

        nameRequired:
          req.body.nameRequired ===
          undefined

            ? Boolean(
                old.nameRequired
              )

            : Boolean(
                req.body.nameRequired
              ),

        published:
          req.body.published ===
          undefined

            ? Boolean(
                old.published
              )

            : Boolean(
                req.body.published
              ),

        updatedAt:
          Date.now()

      };

      await firebaseSet(
        `templates/${id}`,
        updated
      );

      res.json({

        ok: true,

        template:
          updated

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

app.delete(
  "/api/admin/templates/:id",
  requireAdmin,
  async (req, res) => {

    try {

      await firebaseSet(
        `templates/${req.params.id}`,
        null
      );

      res.json({

        ok: true

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
ADS
===================================================== */

app.get(
  "/api/ads",
  async (req, res) => {

    try {

      const data =
        await firebaseGet(
          "ads"
        );

      const ads =
        Object.values(
          data || {}
        )

        .filter(
          ad =>
            ad &&
            ad.enabled === true
        );

      res.json(
        ads
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

app.get(
  "/api/admin/ads",
  requireAdmin,
  async (req, res) => {

    try {

      const data =
        await firebaseGet(
          "ads"
        );

      res.json(
        Object.values(
          data || {}
        )
      );

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
CREATE AD
===================================================== */

app.post(
  "/api/admin/ads",
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        crypto.randomUUID();

      const validPositions = [

        "top",

        "middle",

        "social"

      ];

      const position =
        validPositions.includes(
          req.body.position
        )

          ? req.body.position

          : "middle";

      const ad = {

        id,

        title:
          String(
            req.body.title ||
            "Advertisement"
          ),

        position,

        code:
          String(
            req.body.code ||
            ""
          ),

        enabled:
          Boolean(
            req.body.enabled
          ),

        createdAt:
          Date.now(),

        updatedAt:
          Date.now()

      };

      await firebaseSet(
        `ads/${id}`,
        ad
      );

      res.json({

        ok: true,

        ad

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
UPDATE AD
===================================================== */

app.put(
  "/api/admin/ads/:id",
  requireAdmin,
  async (req, res) => {

    try {

      const id =
        req.params.id;

      const old =
        await firebaseGet(
          `ads/${id}`
        );

      if (!old) {

        return res.status(404).json({

          error:
            "Advertisement not found."

        });

      }

      const validPositions = [

        "top",

        "middle",

        "social"

      ];

      const position =
        validPositions.includes(
          req.body.position
        )

          ? req.body.position

          : old.position;

      const updated = {

        ...old,

        title:
          String(
            req.body.title ??
            old.title ??
            "Advertisement"
          ),

        position,

        code:
          String(
            req.body.code ??
            old.code ??
            ""
          ),

        enabled:
          req.body.enabled ===
          undefined

            ? Boolean(
                old.enabled
              )

            : Boolean(
                req.body.enabled
              ),

        updatedAt:
          Date.now()

      };

      await firebaseSet(
        `ads/${id}`,
        updated
      );

      res.json({

        ok: true,

        ad:
          updated

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
DELETE AD
===================================================== */

app.delete(
  "/api/admin/ads/:id",
  requireAdmin,
  async (req, res) => {

    try {

      await firebaseSet(
        `ads/${req.params.id}`,
        null
      );

      res.json({

        ok: true

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
ANALYTICS
===================================================== */

app.post(
  "/api/analytics/view",
  async (req, res) => {

    try {

      await increment(
        "stats/totalViews"
      );

      if (
        req.body.templateId
      ) {

        await increment(
          `templates/${req.body.templateId}/views`
        );

      }

      res.json({

        ok: true

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
ONLINE USERS
===================================================== */

app.post(
  "/api/online/heartbeat",
  async (req, res) => {

    try {

      const clientId =
        String(
          req.body.clientId || ""
        )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          ""
        )
        .slice(
          0,
          80
        );

      if (!clientId) {

        return res.status(400).json({

          error:
            "Client ID is required."

        });

      }

      await firebaseSet(
        `onlineUsers/${clientId}`,
        {

          lastSeen:
            Date.now()

        }
      );

      res.json({

        ok: true

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
ADMIN STATISTICS
===================================================== */

app.get(
  "/api/admin/stats",
  requireAdmin,
  async (req, res) => {

    try {

      const stats =
        await firebaseGet(
          "stats"
        );

      const templates =
        await firebaseGet(
          "templates"
        );

      const onlineUsers =
        await firebaseGet(
          "onlineUsers"
        );

      const now =
        Date.now();

      const onlineLimit =
        now -
        90 *
        1000;

      const onlineCount =
        Object.values(
          onlineUsers || {}
        )

        .filter(
          user => {

            return (

              user &&

              Number(
                user.lastSeen
              ) >=
              onlineLimit

            );

          }
        )

        .length;

      const templateList =
        Object.values(
          templates || {}
        )

        .filter(Boolean);

      const trending =
        [...templateList]

          .sort(
            (a, b) => {

              return (

                Number(
                  b.views || 0
                ) -

                Number(
                  a.views || 0
                )

              );

            }
          )

          .slice(
            0,
            10
          )

          .map(
            template => ({

              id:
                template.id,

              title:
                template.title,

              views:
                Number(
                  template.views || 0
                )

            })
          );

      res.json({

        totalViews:
          Number(
            stats?.totalViews || 0
          ),

        onlineUsers:
          onlineCount,

        templatesCount:
          templateList.length,

        trending

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);

/* =====================================================
PAGES
===================================================== */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);

app.get(
  "/template",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "template.html"
      )

    );

  }
);

app.get(
  "/admin",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "admin.html"
      )

    );

  }
);

/* =====================================================
SERVER
===================================================== */

app.listen(
  PORT,
  () => {

    console.log(
      `MAKYAMA Message Server running on port ${PORT}`
    );

  }
);
