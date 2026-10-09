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

  const command = {
    name: "translate",
    description: "Translate a Discord message into Arabic or English",
    type: 1,
    options: [
      {
        name: "language",
        description: "Language to translate into",
        type: 3,
        required: true,
        choices: [
          { name: "English", value: "en" },
          { name: "Arabic", value: "ar" }
        ]
      },
      {
        name: "message_link",
        description: "Link to the Discord message you want translated",
        type: 3,
        required: true
      }
    ]
  };

  try {
    const response = await fetch(
      "https://discord.com/api/v10/applications/" + encodeURIComponent(applicationId) + "/commands",
      {
        method: "PUT",
        headers: {
          Authorization: "Bot " + botToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify([command])
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Command registration failed:", response.status, result);
      return res.status(502).send("Discord command registration failed. Check the application ID and bot token in Vercel.");
    }

    return res.status(200).json({
      success: true,
      message: "Registered /translate. Remove COMMAND_SETUP_SECRET from Vercel now, then redeploy.",
      commands: result.map(({ name, description }) => ({ name, description }))
    });
  } catch (error) {
    console.error("Command registration error:", error);
    return res.status(500).send("Command registration failed. Please try again.");
  }
}
