require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
const mongoUri = process.env.MONGO_URI;

const client = new MongoClient(mongoUri);
let db;
let usersCollection;

const sessions = {};

function generateDates() {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const userName = ctx.from.first_name;

  // Create user profile if not exists
  const existingUser = await usersCollection.findOne({ userId });
  if (!existingUser) {
    await usersCollection.insertOne({ userId, userName, bookings: [] });
  }

  sessions[userId] = {};
  await ctx.reply(
    'Բարի գալուստ, ' + userName + '!',
    Markup.keyboard([['Start']]).resize()
  );
});

bot.hears('Start', (ctx) => {
  const userId = ctx.from.id;
  sessions[userId] = {};
  const dates = generateDates();
  const buttons = dates.map(date => [Markup.button.callback(date, `DATE_${date}`)]);
  ctx.reply('Ընտրեք ամսաթիվը 📅', Markup.inlineKeyboard(buttons));
});

bot.action(/DATE_(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const date = ctx.match[1];
  sessions[userId].date = date;

  const times = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const buttons = times.map(time => [Markup.button.callback(time, `TIME_${time}`)]);
  ctx.editMessageText('Ընտրեք ժամը 🕒', Markup.inlineKeyboard(buttons));
});

bot.action(/TIME_(.+)/, (ctx) => {
  const userId = ctx.from.id;
  const time = ctx.match[1];
  sessions[userId].time = time;

  const options = [['1-2 հոգի'], ['3-4 հոգի'], ['4+ հոգի']];
  const buttons = options.map(opt => Markup.button.callback(opt[0], `PEOPLE_${opt[0]}`));
  ctx.editMessageText('Քանի հոգու համար է սեղանը 👥', Markup.inlineKeyboard(buttons));
});

bot.action(/PEOPLE_(.+)/, async (ctx) => {
  const userId = ctx.from.id;
  const people = ctx.match[1];
  sessions[userId].people = people;

  const booking = {
    date: sessions[userId].date,
    time: sessions[userId].time,
    people: sessions[userId].people,
    createdAt: new Date()
  };

  await usersCollection.updateOne(
    { userId },
    { $push: { bookings: booking } }
  );

  await ctx.editMessageText(`✅ Ձեր ամրագրումը կատարված է\n📅 Օր՝ ${booking.date}\n🕒 Ժամ՝ ${booking.time}\n👥 Մարդիկ՝ ${booking.people}`);
});

bot.command('history', async (ctx) => {
  const userId = ctx.from.id;
  const user = await usersCollection.findOne({ userId });

  if (user && user.bookings && user.bookings.length > 0) {
    const history = user.bookings.map((b, i) =>
      `#${i + 1} 📅 ${b.date} | 🕒 ${b.time} | 👥 ${b.people}`
    ).join('\n');
    ctx.reply(`📚 Ձեր ամրագրումների պատմությունը՝\n\n${history}`);
  } else {
    ctx.reply('Դուք դեռ չունեք ամրագրումներ։');
  }
});

async function startBot() {
  try {
    await client.connect();
    db = client.db('kamancha');
    usersCollection = db.collection('users');

    // Ջնջում ենք բոլոր Bot Commands-ները
    await bot.telegram.setMyCommands([]);

    console.log('✅ MongoDB Connected');
    await bot.launch();
    console.log('🤖 Bot is running...');
  } catch (err) {
    console.error('❌ MongoDB or Bot Error:', err);
  }
}

startBot();
