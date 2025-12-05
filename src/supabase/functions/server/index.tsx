import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use("*", cors());
app.use("*", logger(console.log));

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Sign up route
app.post("/make-server-2e410764/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password || !name) {
      return c.json(
        { error: "Email, password, and name are required" },
        400,
      );
    }

    const { data, error } =
      await supabase.auth.admin.createUser({
        email,
        password,
        user_metadata: { name },
        // Automatically confirm the user's email since an email server hasn't been configured.
        email_confirm: true,
      });

    if (error) {
      console.log(`Signup error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ success: true, user: data.user });
  } catch (error) {
    console.log(`Signup error: ${error}`);
    return c.json({ error: "Failed to create account" }, 500);
  }
});

// Get all medications for a user
app.get("/make-server-2e410764/medications", async (c) => {
  try {
    const accessToken = c.req
      .header("Authorization")
      ?.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (!user?.id || authError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const medications =
      (await kv.get(`user:${user.id}:medications`)) || [];
    return c.json({ medications });
  } catch (error) {
    console.log(`Error fetching medications: ${error}`);
    return c.json(
      { error: "Failed to fetch medications" },
      500,
    );
  }
});

// Add a new medication
app.post("/make-server-2e410764/medications", async (c) => {
  try {
    const accessToken = c.req
      .header("Authorization")
      ?.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (!user?.id || authError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { name, dosage, frequency, reminderTime, refillDate, supplyDays } =
      await c.req.json();

    if (!name || !dosage || !frequency) {
      return c.json(
        { error: "Name, dosage, and frequency are required" },
        400,
      );
    }

    const medications =
      (await kv.get(`user:${user.id}:medications`)) || [];
    const newMedication = {
      id: crypto.randomUUID(),
      name,
      dosage,
      frequency,
      reminderTime: reminderTime || undefined,
      refillDate: refillDate || undefined,
      supplyDays: supplyDays || undefined,
      createdAt: new Date().toISOString(),
    };

    medications.push(newMedication);
    await kv.set(`user:${user.id}:medications`, medications);

    return c.json({ success: true, medication: newMedication });
  } catch (error) {
    console.log(`Error adding medication: ${error}`);
    return c.json({ error: "Failed to add medication" }, 500);
  }
});

// Delete a medication
app.delete(
  "/make-server-2e410764/medications/:id",
  async (c) => {
    try {
      const accessToken = c.req
        .header("Authorization")
        ?.split(" ")[1];
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (!user?.id || authError) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const medId = c.req.param("id");
      const medications =
        (await kv.get(`user:${user.id}:medications`)) || [];
      const filtered = medications.filter(
        (med: any) => med.id !== medId,
      );

      await kv.set(`user:${user.id}:medications`, filtered);

      return c.json({ success: true });
    } catch (error) {
      console.log(`Error deleting medication: ${error}`);
      return c.json(
        { error: "Failed to delete medication" },
        500,
      );
    }
  },
);

// Mark medication as taken/not taken
app.post("/make-server-2e410764/mark-taken", async (c) => {
  try {
    const accessToken = c.req
      .header("Authorization")
      ?.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (!user?.id || authError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { medicationId, date, taken } = await c.req.json();

    if (!medicationId || !date) {
      return c.json(
        { error: "Medication ID and date are required" },
        400,
      );
    }

    const key = `user:${user.id}:taken:${date}`;
    const takenMeds = (await kv.get(key)) || {};

    takenMeds[medicationId] = taken;
    await kv.set(key, takenMeds);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Error marking medication: ${error}`);
    return c.json(
      { error: "Failed to update medication status" },
      500,
    );
  }
});

// Get taken status for today
app.get("/make-server-2e410764/taken/:date", async (c) => {
  try {
    const accessToken = c.req
      .header("Authorization")
      ?.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (!user?.id || authError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const date = c.req.param("date");
    const key = `user:${user.id}:taken:${date}`;
    const takenMeds = (await kv.get(key)) || {};

    return c.json({ takenMeds });
  } catch (error) {
    console.log(`Error fetching taken status: ${error}`);
    return c.json(
      { error: "Failed to fetch taken status" },
      500,
    );
  }
});

// Get medication information from AI
app.post("/make-server-2e410764/medication-info", async (c) => {
  try {
    const accessToken = c.req
      .header("Authorization")
      ?.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (!user?.id || authError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { medicationName } = await c.req.json();

    if (!medicationName) {
      return c.json(
        { error: "Medication name is required" },
        400,
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return c.json(
        {
          error:
            "AI service not configured. Please add your OpenAI API key.",
        },
        500,
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful medication information assistant. Provide factual information about medications including common uses, side effects, and generic/brand names. Always remind users that this is educational information only and they should consult their doctor or pharmacist for medical advice.",
            },
            {
              role: "user",
              content: `Please provide information about the medication: ${medicationName}. Include: 1) Common uses, 2) Common side effects, 3) Generic/brand names if applicable, 4) Important precautions. Keep it concise and easy to understand.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`OpenAI API error: ${errorText}`);
      return c.json(
        {
          error: "Failed to get medication information from AI",
        },
        500,
      );
    }

    const data = await response.json();
    const info =
      data.choices[0]?.message?.content ||
      "No information available";

    return c.json({ info });
  } catch (error) {
    console.log(`Error getting medication info: ${error}`);
    return c.json(
      { error: "Failed to get medication information" },
      500,
    );
  }
});

// Check medication interactions
app.post(
  "/make-server-2e410764/check-interactions",
  async (c) => {
    try {
      const accessToken = c.req
        .header("Authorization")
        ?.split(" ")[1];
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (!user?.id || authError) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { medications } = await c.req.json();

      if (!medications || medications.length === 0) {
        return c.json({
          interactions: "No medications to check",
        });
      }

      if (medications.length === 1) {
        return c.json({
          interactions:
            "You need at least 2 medications to check for interactions.",
        });
      }

      const apiKey = Deno.env.get("OPENAI_API_KEY");

      if (!apiKey) {
        return c.json(
          {
            error:
              "AI service not configured. Please add your OpenAI API key.",
          },
          500,
        );
      }

      const medicationList = medications
        .map((m: any) => `${m.name} (${m.dosage})`)
        .join(", ");

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a medication safety assistant. Analyze medication combinations for potential dangerous interactions. Be thorough but concise. Always include a disclaimer that this is educational information and patients should consult their doctor or pharmacist for medical advice.",
              },
              {
                role: "user",
                content: `Analyze these medications for potentially dangerous interactions: ${medicationList}. List any significant interactions, their severity, and what to watch for. If no major interactions are found, state that clearly. Format your response with clear sections.`,
              },
            ],
            temperature: 0.7,
            max_tokens: 800,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log(
          `OpenAI API error while checking interactions: ${errorText}`,
        );
        return c.json(
          { error: "Failed to check interactions" },
          500,
        );
      }

      const data = await response.json();
      const interactions =
        data.choices[0]?.message?.content ||
        "Unable to analyze interactions";

      return c.json({ interactions });
    } catch (error) {
      console.log(
        `Error checking medication interactions: ${error}`,
      );
      return c.json(
        { error: "Failed to check medication interactions" },
        500,
      );
    }
  },
);

// Update medication reminder time
app.patch(
  "/make-server-2e410764/medications/:id/reminder",
  async (c) => {
    try {
      const accessToken = c.req
        .header("Authorization")
        ?.split(" ")[1];
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (!user?.id || authError) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const medId = c.req.param("id");
      const { reminderTime } = await c.req.json();

      const medications =
        (await kv.get(`user:${user.id}:medications`)) || [];
      const medIndex = medications.findIndex(
        (med: any) => med.id === medId,
      );

      if (medIndex === -1) {
        return c.json({ error: "Medication not found" }, 404);
      }

      medications[medIndex].reminderTime = reminderTime;
      await kv.set(`user:${user.id}:medications`, medications);

      return c.json({
        success: true,
        medication: medications[medIndex],
      });
    } catch (error) {
      console.log(`Error updating reminder: ${error}`);
      return c.json(
        { error: "Failed to update reminder" },
        500,
      );
    }
  },
);

// Get medical conditions for a user
app.get(
  "/make-server-2e410764/medical-conditions",
  async (c) => {
    try {
      const accessToken = c.req
        .header("Authorization")
        ?.split(" ")[1];
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (!user?.id || authError) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const conditions =
        (await kv.get(`user:${user.id}:conditions`)) || [];
      return c.json({ conditions });
    } catch (error) {
      console.log(`Error fetching conditions: ${error}`);
      return c.json(
        { error: "Failed to fetch conditions" },
        500,
      );
    }
  },
);

// Add a medical condition
app.post(
  "/make-server-2e410764/medical-conditions",
  async (c) => {
    try {
      const accessToken = c.req
        .header("Authorization")
        ?.split(" ")[1];
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (!user?.id || authError) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { condition } = await c.req.json();

      if (!condition) {
        return c.json(
          { error: "Condition is required" },
          400,
        );
      }

      const conditions =
        (await kv.get(`user:${user.id}:conditions`)) || [];
      
      if (!conditions.includes(condition)) {
        conditions.push(condition);
        await kv.set(`user:${user.id}:conditions`, conditions);
      }

      return c.json({ success: true, conditions });
    } catch (error) {
      console.log(`Error adding condition: ${error}`);
      return c.json({ error: "Failed to add condition" }, 500);
    }
  },
);

// Remove a medical condition
app.delete(
  "/make-server-2e410764/medical-conditions",
  async (c) => {
    try {
      const accessToken = c.req
        .header("Authorization")
        ?.split(" ")[1];
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (!user?.id || authError) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { condition } = await c.req.json();

      if (!condition) {
        return c.json(
          { error: "Condition is required" },
          400,
        );
      }

      const conditions =
        (await kv.get(`user:${user.id}:conditions`)) || [];
      const filtered = conditions.filter(
        (c: string) => c !== condition,
      );

      await kv.set(`user:${user.id}:conditions`, filtered);

      return c.json({ success: true });
    } catch (error) {
      console.log(`Error removing condition: ${error}`);
      return c.json(
        { error: "Failed to remove condition" },
        500,
      );
    }
  },
);

// Get condition information from AI
app.post("/make-server-2e410764/condition-info", async (c) => {
  try {
    const accessToken = c.req
      .header("Authorization")
      ?.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (!user?.id || authError) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { conditionName } = await c.req.json();

    if (!conditionName) {
      return c.json(
        { error: "Condition name is required" },
        400,
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return c.json(
        {
          error:
            "AI service not configured. Please add your OpenAI API key.",
        },
        500,
      );
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful medical condition information assistant. Provide factual information about medical conditions including common symptoms, causes, and general treatment approaches. Always remind users that this is educational information only and they should consult their doctor or healthcare provider for diagnosis and treatment.",
            },
            {
              role: "user",
              content: `Please provide information about the medical condition: ${conditionName}. Include: 1) What it is, 2) Common symptoms, 3) Common causes or risk factors, 4) General treatment approaches. Keep it concise and easy to understand.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`OpenAI API error: ${errorText}`);
      return c.json(
        {
          error: "Failed to get condition information from AI",
        },
        500,
      );
    }

    const data = await response.json();
    const info =
      data.choices[0]?.message?.content ||
      "No information available";

    return c.json({ info });
  } catch (error) {
    console.log(`Error getting condition info: ${error}`);
    return c.json(
      { error: "Failed to get condition information" },
      500,
    );
  }
});

Deno.serve(app.fetch);