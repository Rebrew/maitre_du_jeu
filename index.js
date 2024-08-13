require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildIntegrations
  ],
});

let themeDescriptions = loadThemeDescriptions(); // Chargement direct au démarrage
let questHistory = loadQuestHistory(); // Chargement direct au démarrage

// Centralisation de la configuration et des headers API
const apiConfig = {
  baseURL: 'https://api.openai.com/v1/chat/completions',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  maxTokens: 4000,
};

// Gestion centralisée des erreurs
function handleError(error, interaction) {
  console.error(`Erreur : ${error}`);
  interaction.reply(`Une erreur est survenue lors de la gestion de votre requête. Erreur : ${error.message}`);
}

client.once('ready', () => {
  console.log('Le maître du jeu est en ligne');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'Aventure') {
    const theme = interaction.options.getString('theme');
    await startAdventure(interaction, theme);
  }
});

async function startAdventure(interaction, theme) {
  if (!themeDescriptions[theme]) {
    await interaction.reply(`Thème non reconnu. Veuillez choisir parmi les suivants: ${Object.keys(themeDescriptions).join(', ')}`);
    return;
  }

  // Initialisation de l'historique de la session avec des instructions initiales spécifiques au thème choisi
  const sessionHistory = [{
    role: "system",
    content: `Vous commencez votre aventure dans le thème '${theme}'. ${themeDescriptions[theme]} Pour interagir avec l'aventure, répondez avec le texte de votre choix.`
  }];

  const prompt = `Créez une aventure unique dans un univers de ${theme}.`;

  try {
    await generateAdventureWithHistory(prompt, sessionHistory, interaction);
  } catch (error) {
    handleError(error, interaction);
  }
}

async function generateAdventureWithHistory(prompt, sessionHistory, interaction, retryCount = 0) {
  sessionHistory.push({ role: "user", content: prompt });

  try {
    const response = await axios.post(apiConfig.baseURL, {
      model: "gpt-4o-mini", // Utilisation du modèle gpt-4o-mini
      messages: sessionHistory,
      max_tokens: apiConfig.maxTokens
    }, { headers: apiConfig.headers });

    let nextPart = response.data.choices[0]?.message?.content?.trim();

    if (!nextPart || typeof nextPart !== 'string') {
      throw new Error("La réponse de l'API est vide ou indéfinie.");
    }

    await sendInChunksByParagraph(interaction, nextPart);

    sessionHistory.push({ role: "system", content: nextPart });
    saveHistoryForSession(interaction.channel.id, sessionHistory);

  } catch (error) {
    if (error.response && error.response.status === 429) {
      const delay = Math.pow(2, retryCount) * 10000; // Délai exponentiel : 10s, 20s, 40s, 80s, etc.
      console.error(`Limite d'API atteinte. Tentative après ${delay / 1000} secondes...`);
      setTimeout(async () => {
        await generateAdventureWithHistory(prompt, sessionHistory, interaction, retryCount + 1);
      }, delay);
    } else {
      handleError(error, interaction);
    }
  }
}

async function sendInChunksByParagraph(interaction, text) {
  const paragraphs = text.split('\n'); // Divise le texte par les sauts de ligne

  for (const paragraph of paragraphs) {
    if (paragraph.trim().length > 0) { // Assure-toi de ne pas envoyer de paragraphes vides
      await interaction.followUp(paragraph.trim()).catch(err => console.error("Erreur lors de l'envoi :", err));
    }
  }
}

function saveHistoryForSession(channelId, sessionHistory) {
  const questHistory = loadQuestHistory();
  questHistory[channelId] = sessionHistory;
  fs.writeFileSync('questHistory.json', JSON.stringify(questHistory, null, 2), 'utf-8');
}

function loadThemeDescriptions() {
  try {
    return JSON.parse(fs.readFileSync('themes.json', 'utf-8'));
  } catch (error) {
    console.error("Erreur lors du chargement des descriptions des thèmes :", error);
    return {};
  }
}

function loadQuestHistory() {
  try {
    return JSON.parse(fs.readFileSync('questHistory.json', 'utf-8'));
  } catch (error) {
    console.error("Erreur lors du chargement de l'historique des quêtes :", error);
    return {};
  }
}

// Enregistrement de la commande Slash
(async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  const commands = [
    new SlashCommandBuilder()
      .setName('aventure')
      .setDescription('Commence une nouvelle aventure dans un thème spécifique')
      .addStringOption(option =>
        option.setName('theme')
          .setDescription('Le thème de l\'aventure')
          .setRequired(true)
      )
      .toJSON()
  ];

  try {
    console.log('Enregistrement des commandes slash...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Commandes enregistrées avec succès.');
  } catch (error) {
    console.error(error);
  }
})();

client.login(process.env.TOKEN);