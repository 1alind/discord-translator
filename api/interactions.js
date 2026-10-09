import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey,
} from "discord-interactions";

export const config = { api: { bodyParser: false } };
const EPHEMERAL = InteractionResponseFlags.EPHEMERAL;

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function reply(content) {
  return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content, flags: EPHEMERAL } };
}

function getOptions(interaction) {
  const result = {};
  for (const option of interaction.data?.options ?? []) result[option.name] = option.value;
  return result;
}

function parseMessageUrl(value) {
  if (!value) return null;
  const match = String(value).match(/^https?:\/\/(?:www\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/);
  return match ? { channelId: match[2], messageId: match[3] } : null;
}

async function fetchDiscordMessage(channelId, messageId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Missing DISCORD_BOT_TOKEN");
  const response = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages/" + messageId, {
    headers: { Authorization: "Bot " + token },
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) throw new Error("I cannot access that message. Make sure I can view its channel.");
    throw new Error("Discord API returned " + response.status);
  }
  return response.json();
}

async function translateText(text, target) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, 4500));
  url.searchParams.set("langpair", target === "ar" ? "autodetect|ar" : "autodetect|en");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Translation service is temporarily unavailable.");
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || data?.responseStatus !== 200) throw new Error("The translation service could not translate that message.");
  return translated;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  try {
    const signature = req.headers["x-signature-ed25519"];
    const timestamp = req.headers["x-signature-timestamp"];
    if (!signature || !timestamp || !process.env.DISCORD_PUBLIC_KEY) return res.status(401).send("Missing Discord signature configuration");
    const rawBody = await getRawBody(req);
    const isValid = await verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
    if (!isValid) return res.status(401).send("Invalid signature");
    const interaction = JSON.parse(rawBody.toString("utf8"));
    if (interaction.type === InteractionType.PING) return res.status(200).json({ type: InteractionResponseType.PONG });
    if (interaction.type !== InteractionType.APPLICATION_COMMAND) return res.status(400).send("Unsupported interaction type");

    const options = getOptions(interaction);
    const target = options.language ?? options.target ?? options.to;
    if (!["ar", "en"].includes(target)) return res.status(200).json(reply("Choose a target language: ar for Arabic or en for English."));

    // Regular slash-command payloads do not include the message being replied to.
    // A message link is the reliable way to identify the source message.
    const parsed = parseMessageUrl(options.message_link ?? options.message ?? options.link);
    if (!parsed) return res.status(200).json(reply("Please provide the Discord message link in the message_link option. Discord does not include a replied-to message in a regular slash-command payload."));

    const message = await fetchDiscordMessage(parsed.channelId, parsed.messageId);
    const sourceText = (message.content ?? "").trim();
    if (!sourceText) return res.status(200).json(reply("That message has no text to translate. Image and attachment text are not supported yet."));
    const translated = await translateText(sourceText, target);
    return res.status(200).json(reply("**Translation (" + (target === "ar" ? "Arabic" : "English") + "):**\n" + translated));
  } catch (error) {
    console.error("Interaction error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const userMessage = message.includes("DISCORD_BOT_TOKEN")
      ? "The bot token is not configured on the hosting service yet."
      : message.startsWith("I cannot access") ? message : "Sorry, translation failed. Please try again in a moment.";
    return res.status(200).json(reply(userMessage));
  }
}
