// main.js
// Node.js + discord.js v14
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { Client, Collection, GatewayIntentBits, Events, REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null; // opcional: definir para registrar comandos só no guild de dev

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Defina TOKEN e CLIENT_ID no arquivo .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();    // comandos slash
client.components = new Collection();  // handlers de componentes (buttons / select menus)

// --- Carrega comandos de ./commands ---
const commandsPath = path.join(__dirname, 'commands');
const slashCommands = [];
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // cada arquivo de comando deve exportar: { data: SlashCommandBuilder, execute: async (interaction) => {} }
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command);
      slashCommands.push(command.data.toJSON());
    } else {
      console.warn(`⚠️ Comando inválido: ${file}`);
    }
  }
}

// --- Carrega handlers de componentes de ./components ---
const componentsPath = path.join(__dirname, 'components');
if (fs.existsSync(componentsPath)) {
  const componentFiles = fs.readdirSync(componentsPath).filter(f => f.endsWith('.js'));
  for (const file of componentFiles) {
    const filePath = path.join(componentsPath, file);
    const comp = require(filePath);
    // cada arquivo de componente deve exportar: { id: 'meu_custom_id', execute: async (interaction) => {} }
    if (comp?.id && comp?.execute) {
      client.components.set(comp.id, comp);
    } else {
      console.warn(`⚠️ Componente inválido: ${file}`);
    }
  }
}

// --- Registra comandos (guild ou global dependendo do GUILD_ID) ---
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    if (slashCommands.length === 0) {
      console.log('ℹ️ Nenhum comando para registrar.');
    } else if (GUILD_ID) {
      console.log(`🔁 Registrando ${slashCommands.length} comandos no guild ${GUILD_ID}...`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: slashCommands });
      console.log('✅ Comandos registrados (guild).');
    } else {
      console.log(`🔁 Registrando ${slashCommands.length} comandos globalmente... (pode levar alguns minutos)`);
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
      console.log('✅ Comandos registrados (global).');
    }
  } catch (err) {
    console.error('Erro ao registrar comandos:', err);
  }
})();

// --- Interactions handler (comandos e componentes) ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return interaction.reply({ content: 'Comando não encontrado.', ephemeral: true });
      await command.execute(interaction, client);
    } else if (interaction.isButton() || interaction.isSelectMenu()) {
      // customId do componente pode ter formato "id:resto" -> tentamos casar por prefixo
      const customId = interaction.customId;
      let handler = client.components.get(customId);
      if (!handler) {
        const prefix = customId.split(':')[0];
        handler = client.components.get(prefix);
      }
      if (!handler) return interaction.reply({ content: 'Handler de componente não encontrado.', ephemeral: true });
      await handler.execute(interaction, client);
    } else if (interaction.isAutocomplete()) {
      // caso implemente autocomplete, o handler ficaria no próprio arquivo de comando
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction);
      }
    }
  } catch (err) {
    console.error('Erro no interaction handler:', err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: 'Ocorreu um erro ao processar sua interação.', ephemeral: true });
      } catch {}
    }
  }
});

// --- Ready ---
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 ${c.user.tag} pronto!`);
  client.user.setActivity('/ajuda', { type: 3 }).catch(() => {});
});

// --- Login ---
client.login(TOKEN).catch(err => {
  console.error('Erro ao logar:', err);
  process.exit(1);
});
