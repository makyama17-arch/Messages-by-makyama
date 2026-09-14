const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const os = require("os");

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

      /*
        Code is correct.

        Remove the temporary OTP immediately
        so it cannot be reused.
      */

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

    let playwrightAvailable =
      false;

    let ffmpegAvailable =
      false;

    try {

      require(
        "playwright"
      );

      playwrightAvailable =
        true;

    } catch (error) {

      playwrightAvailable =
        false;

    }

    try {

      const ffmpeg =
        require(
          "ffmpeg-static"
        );

      ffmpegAvailable =
        Boolean(
          ffmpeg
        );

    } catch (error) {

      ffmpegAvailable =
        false;

    }

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

      playwright:
        playwrightAvailable,

      ffmpeg:
        ffmpegAvailable,

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

            downloads:
              Number(
                template.downloads || 0
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

        downloads: 0,

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

        "social",

        "download"

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

        "social",

        "download"

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

app.post(
  "/api/analytics/download",
  async (req, res) => {

    try {

      await increment(
        "stats/totalDownloads"
      );

      if (
        req.body.templateId
      ) {

        await increment(
          `templates/${req.body.templateId}/downloads`
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

      const mostDownloaded =
        [...templateList]

          .sort(
            (a, b) => {

              return (

                Number(
                  b.downloads || 0
                ) -

                Number(
                  a.downloads || 0
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

              downloads:
                Number(
                  template.downloads || 0
                )

            })
          );

      res.json({

        totalViews:
          Number(
            stats?.totalViews || 0
          ),

        totalDownloads:
          Number(
            stats?.totalDownloads || 0
          ),

        onlineUsers:
          onlineCount,

        templatesCount:
          templateList.length,

        trending,

        mostDownloaded

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
SERVER-SIDE VIDEO GENERATION
===================================================== */

app.post(
  "/api/generate-video",
  async (req, res) => {

    let tempDir = null;

    try {

      const templateId =
        String(
          req.body.templateId || ""
        ).trim();

      const name =
        String(
          req.body.name ||
          "Rafiki"
        )
        .trim()
        .slice(
          0,
          80
        );

      if (!templateId) {

        return res.status(400).json({

          error:
            "Template ID is required."

        });

      }

      const template =
        await firebaseGet(
          `templates/${templateId}`
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

      tempDir =
        await fs.promises.mkdtemp(
          path.join(
            os.tmpdir(),
            "makyama-video-"
          )
        );

      const htmlPath =
        path.join(
          tempDir,
          "render.html"
        );

      const framesDir =
        path.join(
          tempDir,
          "frames"
        );

      const outputPath =
        path.join(
          tempDir,
          "MAKYAMA_Message.mp4"
        );

      await fs.promises.mkdir(
        framesDir,
        {
          recursive:
            true
        }
      );

      const safeName =
        escapeHtmlServer(
          name || "Rafiki"
        );

      const templateHTML =
        String(
          template.html || ""
        )

        .replace(
          /<script[\s\S]*?<\/script>/gi,
          ""
        )

        .replaceAll(
          "{name}",
          safeName
        );

      const brandingHTML = `

<div
  id="makyama-brand"
  aria-hidden="true"
>

  <div class="makyama-brand-name">
    MAKYAMA MESSAGES
  </div>

  <div class="makyama-brand-url">
    makyama.pntr.dev
  </div>

</div>

<style>

#makyama-brand{

  position:absolute;

  right:18px;
  bottom:16px;

  z-index:999999;

  display:flex;

  flex-direction:column;

  align-items:flex-end;

  gap:3px;

  padding:7px 10px;

  border-radius:10px;

  background:
    rgba(4,10,22,.62);

  border:
    1px solid
    rgba(255,255,255,.14);

  box-shadow:
    0 4px 18px
    rgba(0,0,0,.28);

  backdrop-filter:
    blur(7px);

  -webkit-backdrop-filter:
    blur(7px);

  pointer-events:none;

  user-select:none;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

}

.makyama-brand-name{

  color:#ffffff;

  font-size:11px;

  line-height:1;

  font-weight:800;

  letter-spacing:.7px;

  text-shadow:
    0 1px 4px
    rgba(0,0,0,.55);

}

.makyama-brand-url{

  color:
    rgba(255,255,255,.68);

  font-size:7px;

  line-height:1;

  font-weight:500;

  letter-spacing:.25px;

}

</style>

`;

      const fullHtml = `
<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=720,height=720,initial-scale=1"
>

<style>

html,
body {

  margin:0;

  padding:0;

  width:720px;

  height:720px;

  overflow:hidden;

  background:#07101f;

}

* {

  box-sizing:border-box;

}

#stage {

  width:720px;

  height:720px;

  position:relative;

  overflow:hidden;

}

</style>

</head>

<body>

<div id="stage">

${templateHTML}

${brandingHTML}

</div>

</body>

</html>
`;

      await fs.promises.writeFile(
        htmlPath,
        fullHtml,
        "utf8"
      );

      console.log(
        "Starting MP4 rendering..."
      );

      await renderVideoWithTools(
        htmlPath,
        framesDir,
        outputPath
      );

      if (
        !fs.existsSync(
          outputPath
        )
      ) {

        throw new Error(
          "Video file was not created."
        );

      }

      const fileSize =
        (
          await fs.promises.stat(
            outputPath
          )
        ).size;

      if (
        fileSize <= 1000
      ) {

        throw new Error(
          "Generated video is empty."
        );

      }

      console.log(
        "MP4 created:",
        outputPath
      );

      console.log(
        "MP4 size:",
        fileSize,
        "bytes"
      );

      try {

        await increment(
          "stats/totalDownloads"
        );

        await increment(
          `templates/${templateId}/downloads`
        );

      } catch (
        analyticsError
      ) {

        console.error(
          "Analytics error:",
          analyticsError.message
        );

      }

      res.statusCode = 200;

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Length",
        String(fileSize)
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="MAKYAMA_Message.mp4"'
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      const stream =
        fs.createReadStream(
          outputPath
        );

      let streamFinished =
        false;

      stream.on(
        "error",
        async error => {

          console.error(
            "MP4 stream error:",
            error.message
          );

          if (
            !res.headersSent
          ) {

            res.status(500).json({

              error:
                "Unable to download generated video."

            });

          }

          await cleanupTempDirectory(
            tempDir
          );

        }
      );

      stream.on(
        "end",
        async () => {

          streamFinished =
            true;

          console.log(
            "MP4 download stream completed."
          );

          await cleanupTempDirectory(
            tempDir
          );

        }
      );

      res.on(
        "close",
        async () => {

          if (
            !streamFinished
          ) {

            stream.destroy();

            await cleanupTempDirectory(
              tempDir
            );

          }

        }
      );

      stream.pipe(
        res
      );

      tempDir = null;

    } catch (error) {

      console.error(
        "Generate video error:",
        error
      );

      await cleanupTempDirectory(
        tempDir
      );

      if (
        !res.headersSent
      ) {

        res.status(500).json({

          error:
            error.message ||
            "Video generation failed."

        });

      }

    }

  }
);

/* =====================================================
ESCAPE HTML
===================================================== */

function escapeHtmlServer(
  value
) {

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}

/* =====================================================
VIDEO RENDER ENGINE
===================================================== */

async function renderVideoWithTools(
  htmlPath,
  framesDir,
  outputPath
) {

  let playwright;

  try {

    playwright =
      require(
        "playwright"
      );

  } catch (error) {

    throw new Error(
      "Playwright is not installed."
    );

  }

  let ffmpegPath;

  try {

    ffmpegPath =
      require(
        "ffmpeg-static"
      );

  } catch (error) {

    throw new Error(
      "ffmpeg-static is not installed."
    );

  }

  if (
    !ffmpegPath
  ) {

    throw new Error(
      "FFmpeg executable was not found."
    );

  }

  const browser =
    await playwright
      .chromium
      .launch({

        headless:
          true,

        args:[

          "--no-sandbox",

          "--disable-setuid-sandbox",

          "--disable-dev-shm-usage",

          "--disable-gpu",

          "--font-render-hinting=medium"

        ]

      });

  try {

    const page =
      await browser.newPage({

        viewport:{

          width:
            720,

          height:
            720

        },

        deviceScaleFactor:
          1

      });

    await page.goto(
      "file://" +
      htmlPath,
      {

        waitUntil:
          "load"

      }
    );

    await page.evaluate(
      async () => {

        if (
          document.fonts &&
          document.fonts.ready
        ) {

          await document
            .fonts
            .ready;

        }

        const images =
          Array.from(
            document.images
          );

        await Promise.all(

          images.map(
            image => {

              if (
                image.complete
              ) {

                return Promise.resolve();

              }

              return new Promise(
                resolve => {

                  image.onload =
                    resolve;

                  image.onerror =
                    resolve;

                }
              );

            }
          )

        );

      }
    );

    await page.waitForTimeout(
      700
    );

    const duration =
      await page.evaluate(
        () => {

          let longest =
            5000;

          function parseTime(
            value
          ) {

            value =
              String(
                value || ""
              ).trim();

            if (
              value.endsWith(
                "ms"
              )
            ) {

              return (
                parseFloat(
                  value
                ) || 0
              );

            }

            if (
              value.endsWith(
                "s"
              )
            ) {

              return (

                (
                  parseFloat(
                    value
                  ) || 0
                ) *
                1000

              );

            }

            return 0;

          }

          document
            .querySelectorAll("*")
            .forEach(
              element => {

                const style =
                  getComputedStyle(
                    element
                  );

                const durations =
                  style
                    .animationDuration
                    .split(",");

                const delays =
                  style
                    .animationDelay
                    .split(",");

                durations.forEach(
                  (
                    durationValue,
                    index
                  ) => {

                    const d =
                      parseTime(
                        durationValue
                      );

                    const delay =
                      parseTime(
                        delays[index] ||
                        delays[0] ||
                        "0s"
                      );

                    longest =
                      Math.max(
                        longest,
                        d + delay
                      );

                  }
                );

              }
            );

          return Math.min(

            Math.max(
              longest + 500,
              3000
            ),

            15000

          );

        }
      );

    await captureAnimationFrames(
      page,
      framesDir,
      duration
    );

    await convertFramesToMp4(
      ffmpegPath,
      framesDir,
      outputPath
    );

  } finally {

    await browser.close();

  }

}

/* =====================================================
CAPTURE ANIMATION FRAMES
===================================================== */

async function captureAnimationFrames(
  page,
  framesDir,
  duration
) {

  await page.evaluate(
    () => {

      document
        .querySelectorAll("*")
        .forEach(
          element => {

            element.style
              .setProperty(
                "animation-play-state",
                "paused",
                "important"
              );

          }
        );

    }
  );

  await page.evaluate(
    () => {

      void document
        .body
        .offsetHeight;

    }
  );

  await page.evaluate(
    () => {

      document
        .querySelectorAll("*")
        .forEach(
          element => {

            element.style
              .setProperty(
                "animation",
                "none",
                "important"
              );

          }
        );

    }
  );

  await page.evaluate(
    () => {

      void document
        .body
        .offsetHeight;

    }
  );

  await page.evaluate(
    () => {

      document
        .querySelectorAll("*")
        .forEach(
          element => {

            element.style
              .removeProperty(
                "animation"
              );

            element.style
              .setProperty(
                "animation-play-state",
                "running",
                "important"
              );

          }
        );

    }
  );

  const fps =
    24;

  const frameDuration =
    1000 / fps;

  const totalFrames =
    Math.max(

      1,

      Math.ceil(
        duration /
        frameDuration
      )

    );

  const start =
    Date.now();

  for (
    let frame = 0;
    frame < totalFrames;
    frame++
  ) {

    const filename =
      path.join(
        framesDir,
        `frame-${String(frame).padStart(5, "0")}.png`
      );

    await page
      .locator(
        "#stage"
      )
      .screenshot({

        path:
          filename,

        type:
          "png",

        animations:
          "allow"

      });

    const target =
      (
        frame + 1
      ) *
      frameDuration;

    const elapsed =
      Date.now() -
      start;

    const wait =
      target -
      elapsed;

    if (
      wait > 0
    ) {

      await page.waitForTimeout(
        wait
      );

    }

  }

}

/* =====================================================
FRAMES → MP4
===================================================== */

function convertFramesToMp4(
  ffmpegPath,
  framesDir,
  outputPath
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const inputPattern =
        path.join(
          framesDir,
          "frame-%05d.png"
        );

      const {
        spawn
      } =
        require(
          "child_process"
        );

      const ffmpeg =
        spawn(
          ffmpegPath,
          [

            "-y",

            "-framerate",
            "24",

            "-start_number",
            "0",

            "-i",
            inputPattern,

            "-c:v",
            "libx264",

            "-preset",
            "veryfast",

            "-crf",
            "20",

            "-pix_fmt",
            "yuv420p",

            "-vf",
            "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2",

            "-movflags",
            "+faststart",

            outputPath

          ],

          {

            stdio:[
              "ignore",
              "pipe",
              "pipe"
            ]

          }

        );

      let stderr = "";

      ffmpeg.stderr.on(
        "data",
        data => {

          stderr +=
            data.toString();

        }
      );

      ffmpeg.on(
        "error",
        error => {

          reject(
            new Error(
              "FFmpeg could not start: " +
              error.message
            )
          );

        }
      );

      ffmpeg.on(
        "close",
        code => {

          if (
            code === 0
          ) {

            resolve();

          } else {

            reject(
              new Error(
                "FFmpeg failed: " +
                stderr.slice(
                  -3000
                )
              )
            );

          }

        }
      );

    }
  );

}

/* =====================================================
TEMP FILE CLEANUP
===================================================== */

async function cleanupTempDirectory(
  tempDir
) {

  if (!tempDir) return;

  try {

    await fs.promises.rm(
      tempDir,
      {

        recursive:
          true,

        force:
          true

      }
    );

    console.log(
      "Temporary video files deleted."
    );

  } catch (error) {

    console.error(
      "Temporary cleanup error:",
      error.message
    );

  }

}

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
