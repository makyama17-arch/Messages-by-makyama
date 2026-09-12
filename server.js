const express = require("express");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

let db = null;

function initFirebase() {
  if (db) return db;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccount || !databaseURL) {
    return null;
  }

  try {
    const credentials = JSON.parse(serviceAccount);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials),
        databaseURL
      });
    }

    db = admin.database();
    return db;
  } catch (error) {
    console.error("Firebase error:", error.message);
    return null;
  }
}

async function firebaseGet(ref) {
  const database = initFirebase();

  if (!database) {
    throw new Error("Firebase is not configured.");
  }

  const snapshot = await database.ref(ref).once("value");
  return snapshot.val();
}

async function firebaseSet(ref, value) {
  const database = initFirebase();

  if (!database) {
    throw new Error("Firebase is not configured.");
  }

  await database.ref(ref).set(value);
}

async function increment(ref) {
  const database = initFirebase();

  if (!database) return;

  await database.ref(ref).transaction(current => {
    return (Number(current) || 0) + 1;
  });
}

/* =========================
   ADMIN SESSION
========================= */

const adminSessions = new Map();

function requireAdmin(req, res, next) {
  const token = req.cookies.makyama_admin;

  if (!token) {
    return res.status(401).json({
      error: "Admin login required."
    });
  }

  const session = adminSessions.get(token);

  if (!session) {
    return res.status(401).json({
      error: "Invalid admin session."
    });
  }

  if (session.expiresAt < Date.now()) {
    adminSessions.delete(token);

    return res.status(401).json({
      error: "Admin session expired."
    });
  }

  next();
}

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    server: "MAKYAMA MESSAGE SERVER",
    firebase: Boolean(initFirebase()),
    time: new Date().toISOString()
  });
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");

  const correctUsername = process.env.ADMIN_USERNAME;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (!correctUsername || !correctPassword) {
    return res.status(500).json({
      error: "Admin credentials are not configured on Render."
    });
  }

  if (
    username !== correctUsername ||
    password !== correctPassword
  ) {
    return res.status(401).json({
      error: "Invalid username or password."
    });
  }

  const token = crypto.randomBytes(32).toString("hex");

  adminSessions.set(token, {
    username,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000
  });

  res.cookie("makyama_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000
  });

  res.json({
    ok: true,
    message: "Admin login successful."
  });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    username: process.env.ADMIN_USERNAME
  });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = req.cookies.makyama_admin;

  adminSessions.delete(token);
  res.clearCookie("makyama_admin");

  res.json({
    ok: true
  });
});

/* =========================
   PUBLIC TEMPLATES
========================= */

app.get("/api/templates", async (req, res) => {
  try {
    const data = await firebaseGet("templates");

    const templates = Object.values(data || {})
      .filter(template => {
        return template && template.published === true;
      })
      .map(template => ({
        id: template.id,
        title: template.title,
        category: template.category,
        thumbnail: template.thumbnail || "",
        nameRequired: Boolean(template.nameRequired),
        views: Number(template.views || 0),
        downloads: Number(template.downloads || 0)
      }));

    res.json(templates);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   SINGLE TEMPLATE
========================= */

app.get("/api/templates/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const template = await firebaseGet(`templates/${id}`);

    if (!template || template.published !== true) {
      return res.status(404).json({
        error: "Template not found."
      });
    }

    await increment(`templates/${id}/views`);
    await increment("stats/totalViews");

    res.json(template);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   ADMIN TEMPLATES
========================= */

app.get("/api/admin/templates", requireAdmin, async (req, res) => {
  try {
    const data = await firebaseGet("templates");

    res.json(Object.values(data || {}));
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/admin/templates", requireAdmin, async (req, res) => {
  try {
    const id = crypto.randomUUID();

    const title = String(req.body.title || "").trim();
    const category = String(req.body.category || "Other").trim();
    const html = String(req.body.html || "");
    const thumbnail = String(req.body.thumbnail || "");
    const nameRequired = Boolean(req.body.nameRequired);
    const published = Boolean(req.body.published);

    if (!title || !html) {
      return res.status(400).json({
        error: "Title and HTML are required."
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
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await firebaseSet(`templates/${id}`, template);

    res.json({
      ok: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.put("/api/admin/templates/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const old = await firebaseGet(`templates/${id}`);

    if (!old) {
      return res.status(404).json({
        error: "Template not found."
      });
    }

    const updated = {
      ...old,
      title: String(
        req.body.title ?? old.title ?? ""
      ).trim(),

      category: String(
        req.body.category ?? old.category ?? "Other"
      ).trim(),

      html: String(
        req.body.html ?? old.html ?? ""
      ),

      thumbnail: String(
        req.body.thumbnail ?? old.thumbnail ?? ""
      ),

      nameRequired:
        req.body.nameRequired === undefined
          ? Boolean(old.nameRequired)
          : Boolean(req.body.nameRequired),

      published:
        req.body.published === undefined
          ? Boolean(old.published)
          : Boolean(req.body.published),

      updatedAt: Date.now()
    };

    await firebaseSet(`templates/${id}`, updated);

    res.json({
      ok: true,
      template: updated
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.delete("/api/admin/templates/:id", requireAdmin, async (req, res) => {
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
      error: error.message
    });
  }
});

/* =========================
   ADS
========================= */

app.get("/api/ads", async (req, res) => {
  try {
    const data = await firebaseGet("ads");

    const ads = Object.values(data || {})
      .filter(ad => ad && ad.enabled === true);

    res.json(ads);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.get("/api/admin/ads", requireAdmin, async (req, res) => {
  try {
    const data = await firebaseGet("ads");

    res.json(Object.values(data || {}));
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/admin/ads", requireAdmin, async (req, res) => {
  try {
    const id = crypto.randomUUID();

    const validPositions = [
      "top",
      "middle",
      "download"
    ];

    const position = validPositions.includes(req.body.position)
      ? req.body.position
      : "middle";

    const ad = {
      id,
      title: String(
        req.body.title || "Advertisement"
      ),

      position,

      code: String(
        req.body.code || ""
      ),

      enabled: Boolean(req.body.enabled),

      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await firebaseSet(`ads/${id}`, ad);

    res.json({
      ok: true,
      ad
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.put("/api/admin/ads/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    const old = await firebaseGet(`ads/${id}`);

    if (!old) {
      return res.status(404).json({
        error: "Advertisement not found."
      });
    }

    const validPositions = [
      "top",
      "middle",
      "download"
    ];

    const position = validPositions.includes(req.body.position)
      ? req.body.position
      : old.position;

    const updated = {
      ...old,

      title: String(
        req.body.title ?? old.title ?? "Advertisement"
      ),

      position,

      code: String(
        req.body.code ?? old.code ?? ""
      ),

      enabled:
        req.body.enabled === undefined
          ? Boolean(old.enabled)
          : Boolean(req.body.enabled),

      updatedAt: Date.now()
    };

    await firebaseSet(`ads/${id}`, updated);

    res.json({
      ok: true,
      ad: updated
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.delete("/api/admin/ads/:id", requireAdmin, async (req, res) => {
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
      error: error.message
    });
  }
});

/* =========================
   ANALYTICS
========================= */

app.post("/api/analytics/view", async (req, res) => {
  try {
    await increment("stats/totalViews");

    if (req.body.templateId) {
      await increment(
        `templates/${req.body.templateId}/views`
      );
    }

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/analytics/download", async (req, res) => {
  try {
    await increment("stats/totalDownloads");

    if (req.body.templateId) {
      await increment(
        `templates/${req.body.templateId}/downloads`
      );
    }

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   ONLINE USERS
========================= */

app.post("/api/online/heartbeat", async (req, res) => {
  try {
    const clientId = String(
      req.body.clientId || ""
    )
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 80);

    if (!clientId) {
      return res.status(400).json({
        error: "Client ID is required."
      });
    }

    await firebaseSet(
      `onlineUsers/${clientId}`,
      {
        lastSeen: Date.now()
      }
    );

    res.json({
      ok: true
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   ADMIN STATISTICS
========================= */

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const stats = await firebaseGet("stats");
    const templates = await firebaseGet("templates");
    const onlineUsers = await firebaseGet("onlineUsers");

    const now = Date.now();
    const onlineLimit = now - 90 * 1000;

    const onlineCount = Object.values(
      onlineUsers || {}
    ).filter(user => {
      return (
        user &&
        Number(user.lastSeen) >= onlineLimit
      );
    }).length;

    const templateList = Object.values(
      templates || {}
    ).filter(Boolean);

    const trending = [...templateList]
      .sort((a, b) => {
        return (
          Number(b.views || 0) -
          Number(a.views || 0)
        );
      })
      .slice(0, 10)
      .map(template => ({
        id: template.id,
        title: template.title,
        views: Number(template.views || 0)
      }));

    const mostDownloaded = [...templateList]
      .sort((a, b) => {
        return (
          Number(b.downloads || 0) -
          Number(a.downloads || 0)
        );
      })
      .slice(0, 10)
      .map(template => ({
        id: template.id,
        title: template.title,
        downloads: Number(
          template.downloads || 0
        )
      }));

    res.json({
      totalViews: Number(
        stats?.totalViews || 0
      ),

      totalDownloads: Number(
        stats?.totalDownloads || 0
      ),

      onlineUsers: onlineCount,

      templatesCount:
        templateList.length,

      trending,

      mostDownloaded
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   PAGES
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.get("/template", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "template.html"
    )
  );
});

app.get("/admin", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "admin.html"
    )
  );
});

/* =========================
   SERVER
========================= */

app.listen(PORT, () => {
  console.log(
    `MAKYAMA Message Server running on port ${PORT}`
  );
});
