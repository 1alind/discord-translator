import { timingSafeEqual } from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const expectedSecret = process.env.COMMAND_SETUP_SECRET;
  const providedSecret = typeof req.query?.key === "string" ? req.query.key : "";
  if (!expectedSecret || !providedSecret) {
    return res.status(401).send("Unauthorized");
  }

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return res.status(401).send("Unauthorized");
  }

  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!applicationId || !botToken) {
    return res.status(500).send("Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN environment variable.");
  }

  // User-installed message context commands do not require the app's bot user
  // to be added to each server. The selected message is included in the interaction.
  const commands = [
    {
      name: "Translate to Arabic",
      type: 3,
      integration_types: [1],
      contexts: [0, 1, 2]
    },
    {
      name: "Translate to English",
      type: 3,
      integration_types: [1],
      contexts: [0, 1, 2]
    }
  ];

  try {
    const response = await fetch(
      "https://discord.com/api/v10/applications/" + encodeURIComponent(applicationId) + "/commands",
      {
        method: "PUT",
        headers: {
          Authorization: "Bot " + botToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(commands)
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Command registration failed:", response.status, result);
      return res.status(502).send("Discord command registration failed. Check the application ID, bot token, and User Install settings.");
    }

    return res.status(200).json({
      success: true,
      message: "Registered user-installed message translation commands. Remove COMMAND_SETUP_SECRET from Vercel now, then redeploy.",
      commands: result.map(({ name, type, integration_types, contexts }) => ({ name, type, integration_types, contexts }))
    });
  } catch (error) {
    console.error("Command registration error:", error);
    return res.status(500).send("Command registration failed. Please try again.");
  }
}
