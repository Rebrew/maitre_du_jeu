require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let configurationsMonde = {};
let historiqueDesQuetes = {};

const descriptionsTheme = {
  'Science-Fiction': 'Un univers futuriste avec des voyages spatiaux, des extraterrestres et des technologies avancées.',
  'Conte de Fées': 'Un monde magique peuplé de fées, de sorciers, de dragons et de quêtes héroïques.',
  'Donjon et Dragon': 'Un monde médiéval fantastique avec des donjons à explorer, des dragons à combattre et des trésors à découvrir.',
  'Apocalypse Zombie': 'Un monde post-apocalyptique envahi par des zombies, où la survie est le quotidien.',
  'Western': 'Le Far West, avec des duels au soleil, des chasses au trésor et des confrontations avec des bandits.',
  'Cyberpunk': 'Un futur dystopique dominé par la cybernétique, l\'intelligence artificielle et les corporations tout-puissantes.',
  'Steampunk': 'Un univers où la technologie à vapeur a pris une importance prédominante, avec un style victorien.',
  'Fantasy Sombre': 'Un monde fantasy où le danger et la magie sombre prévalent, plein de mystères et de périls.',
  'Époque Viking': 'Une aventure dans le monde des Vikings, explorant des terres inconnues et combattant de féroces ennemis.',
  'Super-Héros': 'Un monde peuplé de super-héros et de super-vilains, où chaque jour est une bataille pour la justice.',
  'Uchronie': 'Une réalité alternative où l\'histoire a pris un tournant différent, mêlant faits historiques et éléments fictifs.'
};

client.on('ready', () => {
  console.log('Le maître du jeu est en ligne');
  chargerConfigurations();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.id !== process.env.CHANNEL_ID) return;

  const channelId = message.channel.id;

  if (message.content.startsWith('!configurerMonde')) {
    const theme = message.content.substring('!configurerMonde '.length).trim();
    if (!descriptionsTheme[theme]) {
      await message.reply(`Thème non reconnu. Veuillez choisir parmi les suivants: ${Object.keys(descriptionsTheme).join(', ')}`);
      return;
    }
    configurationsMonde[message.guild.id] = theme;
    sauvegarderConfigurations();
    await message.reply(`Le monde a été configuré sur le thème: ${theme}. ${descriptionsTheme[theme]}`);
  } else if (message.content.startsWith('!quete')) {
    if (!configurationsMonde[message.guild.id]) {
      await message.reply('Veuillez d\'abord configurer le monde avec la commande !configurerMonde.');
      return;
    }
    initierQuete(channelId, configurationsMonde[message.guild.id]);
  }
});

async function initierQuete(channelId, theme) {
  const prompt = `Vous êtes un assistant dans un univers de ${theme}. Générez une quête passionnante.`;
  historiqueDesQuetes[channelId] = [{ role: "system", content: prompt }];

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: "gpt-4",
      messages: historiqueDesQuetes[channelId],
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    if (response.data.choices.length > 0 && response.data.choices[0].message.content.trim()) {
      const reply = response.data.choices[0].message.content.trim();
      await client.channels.cache.get(channelId).send(reply);
      historiqueDesQuetes[channelId].push({ role: "system", content: reply });
    }
  } catch (error) {
    console.error(`Erreur lors de la génération de la quête : ${error}`);
    client.channels.cache.get(channelId).send("Une erreur est survenue lors de la génération de la quête.");
  }
}

function sauvegarderConfigurations() {
  fs.writeFileSync('configurationsMonde.json', JSON.stringify(configurationsMonde, null, 2), 'utf-8');
}

function chargerConfigurations() {
  try {
    const data = fs.readFileSync('configurationsMonde.json', 'utf-8');
    configurationsMonde = JSON.parse(data);
  } catch (error) {
    configurationsMonde = {};
    console.error("Erreur lors du chargement des configurations de monde:", error);
  }
}

client.login(process.env.TOKEN);
