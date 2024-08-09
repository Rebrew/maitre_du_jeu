require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

// Configuration du client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Centralisation de la configuration API
const apiConfig = {
  baseURL: 'https://api.openai.com/v1/chat/completions',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  maxTokens: 500,
};

// Chargement des données au démarrage
const themeDescriptions = loadJsonFile('themes.json');
let questHistory = loadJsonFile('questHistory.json');

// Gestion centralisée des erreurs
function handleError(error, channel) {
  console.error(`Erreur : ${error}`);
  channel.send(`Une erreur est survenue lors de la gestion de votre requête. Erreur : ${error.message}`);
}

// Fonction principale pour démarrer le bot
client.on('ready', () => {
  console.log('Le maître du jeu est en ligne');
});

// Gestion des messages entrants
client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.id !== process.env.CHANNEL_ID) return;

  if (message.content.startsWith('!aventure')) {
    const theme = message.content.substring('!aventure '.length).trim();
    await startAdventure(message, theme);
  } else {
    await handleUserTextResponse(message);
  }
});

// Démarre une nouvelle aventure
async function startAdventure(message, theme) {
  if (!themeDescriptions[theme]) {
    await message.reply(`Thème non reconnu. Veuillez choisir parmi les suivants: ${Object.keys(themeDescriptions).join(', ')}`);
    return;
  }

  // Initialisation de l'historique de la session avec des instructions initiales spécifiques au thème choisi
  const sessionHistory = [{
    role: "system",
    content: `Vous commencez votre aventure dans le thème '${theme}'. ${themeDescriptions[theme]} Pour interagir avec l'aventure, répondez avec le texte de votre choix.`
  }];

  const prompt = `Créez une aventure unique dans un univers de ${theme}.`;

  try {
    await generateAdventureWithHistory(prompt, sessionHistory, message.channel, true);
  } catch (error) {
    handleError(error, message.channel);
  }
}

// Génère l'aventure en fonction de l'historique de la session
async function generateAdventureWithHistory(prompt, sessionHistory, channel, isNewAdventure = false) {
  sessionHistory.push({ role: "user", content: prompt });

  // Extraction du thème de l'aventure
  const theme = sessionHistory.find(entry => entry.role === 'system')?.content?.match(/thème '(.*?)'/)?.[1];

  // Création du prompt amélioré
  const enhancedPrompt = `
  Vous êtes un maître du jeu pour une aventure dans le thème '${theme}'. 
  Votre rôle est de maintenir la cohérence narrative tout en permettant une liberté créative maximale. 
  Assurez-vous que toutes les réponses sont cohérentes avec le thème et l'histoire en cours.
  Si une réponse de l'utilisateur n'est pas cohérente avec le thème ou l'aventure, signalez-le et proposez une alternative qui respecte le thème.

  Engagez l'utilisateur en décrivant les scènes de manière vivante et en proposant des choix concrets sur ce qu'il peut faire ensuite. Chaque réponse doit contenir au moins deux à trois options spécifiques que l'utilisateur peut choisir pour avancer dans l'histoire. Posez des questions directes pour encourager l'utilisateur à prendre des décisions importantes pour le déroulement de l'aventure.

  ${!isNewAdventure ? `
  Voici l'historique de l'aventure :
  ${sessionHistory.map(entry => `${entry.role === 'system' ? 'Contexte' : 'Utilisateur'} : ${entry.content}`).join('\n')}

  À ce stade de l'histoire, quelles sont les actions possibles pour le personnage ? Proposez des choix qui correspondent au thème et qui permettent de faire avancer l'intrigue.
  
  Si l'utilisateur doit faire un choix ou prendre une décision, proposez-lui au moins deux à trois options spécifiques, par exemple :
  1. [Option 1 liée au thème]
  2. [Option 2 liée au thème]
  3. [Option 3 liée au thème]
  
  ` : ''}
  `;

  sessionHistory.push({ role: "system", content: enhancedPrompt });

  try {
    const response = await axios.post(apiConfig.baseURL, {
      model: "gpt-4o-mini", 
      messages: sessionHistory,
      max_tokens: apiConfig.maxTokens,
      stop: ["\n\n"]
    }, { headers: apiConfig.headers });

    let nextPart = response.data.choices[0]?.message?.content?.trim();

    console.log("Texte brut généré par l'API (sans traitement):");
    console.log(nextPart);

    if (!nextPart || typeof nextPart !== 'string') {
      throw new Error("La réponse de l'API est vide ou indéfinie.");
    }

    // Vérifier la longueur de la réponse
    if (nextPart.length > 4000) {
      nextPart = nextPart.substring(0, 3997) + '...';
    }

    await sendInChunksByParagraph(channel, nextPart);

    sessionHistory.push({ role: "system", content: nextPart });
    saveHistoryForSession(channel.id, sessionHistory);

  } catch (error) {
    handleError(error, channel);
  }
}

// Gestion de la réponse de l'utilisateur
async function handleUserTextResponse(message) {
  const userResponse = message.content.trim();
  const sessionHistory = getHistoryForSession(message.channel.id);

  sessionHistory.push({ role: "user", content: userResponse });

  try {
    await generateAdventureWithHistory(userResponse, sessionHistory, message.channel);
  } catch (error) {
    handleError(error, message.channel);
  }
}

// Envoie le texte par paragraphes
async function sendInChunksByParagraph(channel, text) {
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.trim().length > 0) {
      console.log(`Envoi du chunk (Longueur: ${paragraph.length}) : ${paragraph}`);
      await channel.send(paragraph.trim()).catch(err => console.error("Erreur lors de l'envoi :", err));
    }
  }
}

// Sauvegarde de l'historique de la session
function saveHistoryForSession(channelId, sessionHistory) {
  console.log("Sauvegarde de l'historique de la session :");

  // Filtrer les doublons avant de sauvegarder
  const filteredHistory = removeDuplicates(sessionHistory);

  filteredHistory.forEach((entry, index) => {
    console.log(`Entrée ${index} - Role: ${entry.role}, Content: ${entry.content}`);
  });

  questHistory[channelId] = filteredHistory;
  fs.writeFileSync('questHistory.json', JSON.stringify(questHistory, null, 2), 'utf-8');
}

function removeDuplicates(history) {
  const seen = new Set();
  return history.filter(entry => {
    const key = `${entry.role}-${entry.content.trim()}`;
    if (seen.has(key)) {
      return false;
    } else {
      seen.add(key);
      return true;
    }
  });
}

// Chargement de l'historique pour une session
function getHistoryForSession(channelId) {
  return questHistory[channelId] || [];
}

// Fonction générique pour charger un fichier JSON
function loadJsonFile(fileName) {
  try {
    return JSON.parse(fs.readFileSync(fileName, 'utf-8'));
  } catch (error) {
    console.error(`Erreur lors du chargement de ${fileName} :`, error);
    return {};
  }
}

client.login(process.env.TOKEN);