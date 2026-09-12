const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   BASIC MIDDLEWARE
========================= */

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "public")));


/* =========================
   FIREBASE
========================= */

let db = null;

function initFirebase() {

  if (db) {
    return db;
  }

  const serviceAccount =
    process.env.FIREBASE_SERVICE_ACCOUNT;

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccount || !databaseURL) {

    console.log(
      "Firebase environment variables are not configured yet."
    );

    return null;
  }

  try {

    const credentials =
      JSON.parse(serviceAccount);

    if (!admin.apps.length) {

      admin.initializeApp({

        credential:
          admin.credential.cert(credentials),

        databaseURL:
          databaseURL

      });

    }

    db = admin.database();

    console.log("Firebase connected.");

    return db;

  } catch (error) {

    console.error(
      "Firebase connection error:",
      error.message
    );

    return null;
  }
}


/* =========================
   FIREBASE HELPERS
========================= */

async function firebaseGet(pathName) {

  const database = initFirebase();

  if (!database) {
    throw new Error(
      "Firebase is not configured."
    );
  }

  const snapshot =
    await database
      .ref(pathName)
      .once("value");

  return snapshot.val();
}


async function firebaseSet(pathName, value) {

  const database = initFirebase();

  if (!database) {
    throw new Error(
      "Firebase is not configured."
    );
  }

  await database
    .ref(pathName)
    .set(value);
}


async function firebaseUpdate(pathName, value) {

  const database = initFirebase();

  if (!database) {
    throw new Error(
      "Firebase is not configured."
    );
  }

  await database
    .ref(pathName)
    .update(value);
}


async function increment(pathName) {

  const database = initFirebase();

  if (!database) {
    return;
  }

  await database
    .ref(pathName)
    .transaction(function(current) {

      return (Number(current) || 0) + 1;

    });
}


/* =========================
   ADMIN SESSIONS
========================= */

const adminSessions =
  new Map();


function requireAdmin(req, res, next) {

  const token =
    req.cookies.makyama_admin;

  if (!token) {

    return res.status(401).json({

      error: "Admin login required."

    });

  }


  const session =
    adminSessions.get(token);


  if (!session) {

    return res.status(401).json({

      error: "Invalid admin session."

    });

  }


  if (
    session.expiresAt <
    Date.now()
  ) {

    adminSessions.delete(token);

    return res.status(401).json({

      error: "Admin session expired."

    });

  }


  next();
}


/* =========================
   HEALTH CHECK
========================= */

app.get("/health", function(req, res) {

  res.json({

    ok: true,

    server:
      "MAKYAMA MESSAGE SERVER",

    firebase:
      Boolean(initFirebase()),

    time:
      new Date().toISOString()

  });

});


/* =========================
   ADMIN LOGIN
========================= */

app.post(
  "/api/admin/login",
  function(req, res) {

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
          "Admin credentials are not configured on the server."

      });

    }


    if (
      username !== correctUsername ||
      password !== correctPassword
    ) {

      return res.status(401).json({

        error:
          "Invalid username or password."

      });

    }


    const token =
      crypto.randomBytes(32).toString("hex");


    adminSessions.set(
      token,
      {

        username:
          correctUsername,

        expiresAt:
          Date.now() +
          12 * 60 * 60 * 1000

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
          12 * 60 * 60 * 1000

      }
    );


    res.json({

      ok: true,

      message:
        "Admin login successful."

    });

  }
);


/* =========================
   ADMIN CHECK
========================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  function(req, res) {

    res.json({

      ok: true,

      username:
        process.env.ADMIN_USERNAME

    });

  }
);


/* =========================
   ADMIN LOGOUT
========================= */

app.post(
  "/api/admin/logout",
  requireAdmin,
  function(req, res) {

    const token =
      req.cookies.makyama_admin;

    adminSessions.delete(token);

    res.clearCookie(
      "makyama_admin"
    );


    res.json({

      ok: true

    });

  }
);


/* =========================
   PUBLIC TEMPLATES
========================= */

app.get(
  "/api/templates",
  async function(req, res) {

    try {

      const data =
        await firebaseGet(
          "templates"
        );


      const templates =
        Object.values(
          data || {}
        )
        .filter(function(template) {

          return (
            template &&
            template.published === true
          );

        })
        .map(function(template) {

          return {

            id:
              template.id,

            title:
              template.title,

            category:
              template.category,

            thumbnail:
              template.thumbnail || "",

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
              )

          };

        });


      res.json(templates);

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================
   GET ONE PUBLIC TEMPLATE
========================= */

app.get(
  "/api/templates/:id",
  async function(req, res) {

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


      res.json(template);

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================
   ADMIN: GET TEMPLATES
========================= */

app.get(
  "/api/admin/templates",
  requireAdmin,
  async function(req, res) {

    try {

      const data =
        await firebaseGet(
          "templates"
        );


      const templates =
        Object.values(
          data || {}
        );


      res.json(templates);

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================
   ADMIN: ADD TEMPLATE
========================= */

app.post(
  "/api/admin/templates",
  requireAdmin,
  async function(req, res) {

    try {

      const id =
        crypto.randomUUID();


      const template = {

        id: id,

        title:
          String(
            req.body.title || ""
          ).trim(),

        category:
          String(
            req.body.category || "Other"
          ).trim(),

        html:
          String(
            req.body.html || ""
          ),

        thumbnail:
          String(
            req.body.thumbnail || ""
          ),

        nameRequired:
          Boolean(
            req.body.nameRequired
          ),

        published:
          Boolean(
            req.body.published
          ),

        views: 0,

        downloads: 0,

        createdAt:
          Date.now(),

        updatedAt:
          Date.now()

      };


      if (
        !template.title ||
        !template.html
      ) {

        return res.status(400).json({

          error:
            "Title and HTML are required."

        });

      }


      await firebaseSet(
        `templates/${id}`,
        template
      );


      res.json({

        ok: true,

        template:
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


/* =========================
   ADMIN: EDIT TEMPLATE
========================= */

app.put(
  "/api/admin/templates/:id",
  requireAdmin,
  async function(req, res) {

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
            old.title
          ).trim(),

        category:
          String(
            req.body.category ??
            old.category
          ).trim(),

        html:
          String(
            req.body.html ??
            old.html
          ),

        thumbnail: String(req.body.thumbnail ?? old.thumbnail ?? ""),

        nameRequired:
          Boolean(
            req.body.nameRequired
          ),

        published:
          Boolean(
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


/* =========================
   ADMIN: DELETE TEMPLATE
========================= */

app.delete(
  "/api/admin/templates/:id",
  requireAdmin,
  async function(req, res) {

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


/* =========================
   ADS
========================= */

app.get(
  "/api/ads",
  async function(req, res) {

    try {

      const data =
        await firebaseGet(
          "ads"
        );


      const ads =
        Object.values(
          data || {}
        )
        .filter(function(ad) {

          return (
            ad &&
            ad.enabled === true
          );

        });


      res.json(ads);

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================
   ADMIN: GET ADS
========================= */

app.get(
  "/api/admin/ads",
  requireAdmin,
  async function(req, res) {

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


/* =========================
   ADMIN: ADD AD
========================= */

app.post(
  "/api/admin/ads",
  requireAdmin,
  async function(req, res) {

    try {

      const id =
        crypto.randomUUID();


      const position =
        [
          "top",
          "middle",
          "download"
        ].includes(
          req.body.position
        )
          ? req.body.position
          : "middle";


      const ad = {

        id: id,

        title:
          String(
            req.body.title ||
            "Advertisement"
          ),

        position:
          position,

        code:
          String(
            req.body.code || ""
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

        ad: ad

      });

    } catch (error) {

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================
   ADMIN: EDIT AD
========================= */

app.put(
  "/api/admin/ads/:id",
  requireAdmin,
  async function(req, res) {

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


      const position =
        [
          "top",
          "middle",
          "download"
        ].includes(
          req.body.position
        )
          ? req.body.position
          : old.position;


      const updated = {

        ...old,

        title:
          String(
            req.body.title ??
            old.title
          ),

        position:
          position,

        code:
          String(
            req.body.code ??
            old.code
          ),

        enabled:
          Boolean(
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


/* =========================
   ADMIN: DELETE AD
========================= */

app.delete(
  "/api/admin/ads/:id",
  requireAdmin,
  async function(req, res) {

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


/* =========================
   VIEW ANALYTICS
========================= */

app.post(
  "/api/analytics/view",
  async function(req, res) {

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


/* =========================
   DOWNLOAD ANALYTICS
========================= */

app.post(
  "/api/analytics/download",
  async function(req, res) {

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


/* =========================
   LIVE USERS
========================= */

app.post(
  "/api/online/heartbeat",
  async function(req, res) {

    try {

      const clientId =
        String(
          req.body.clientId || ""
        )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          ""
        )
        .slice(0, 80);


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


/* =========================
   ADMIN STATISTICS
========================= */

app.get(
  "/api/admin/stats",
  requireAdmin,
  async function(req, res) {

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
        90 * 1000;


      const onlineCount =
        Object.values(
          onlineUsers || {}
        )
        .filter(function(user) {

          return (
            user &&
            Number(
              user.lastSeen
            ) >= onlineLimit
          );

        })
        .length;


      const templateList =
        Object.values(
          templates || {}
        )
        .filter(Boolean);


      const trending =
        [...templateList]

          .sort(function(a,b) {

            return (
              Number(b.views || 0) -
              Number(a.views || 0)
            );

          })

          .slice(0,10)

          .map(function(template) {

            return {

              id:
                template.id,

              title:
                template.title,

              views:
                Number(
                  template.views || 0
                )

            };

          });


      const mostDownloaded =
        [...templateList]

          .sort(function(a,b) {

            return (
              Number(b.downloads || 0) -
              Number(a.downloads || 0)
            );

          })

          .slice(0,10)

          .map(function(template) {

            return {

              id:
                template.id,

              title:
                template.title,

              downloads:
                Number(
                  template.downloads || 0
                )

            };

          });


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

        trending:
          trending,

        mostDownloaded:
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


/* =========================
   DEFAULT ROUTE
========================= */

app.get(
  "/",
  function(req, res) {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  function() {

    console.log(
      `MAKYAMA Message Server running on port ${PORT}`
    );

  }
);
