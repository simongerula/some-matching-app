// Weekly themes for the coffee-catchup channel (rotates once a week)
const themes = [
  { title: 'What is one small win you had this week that nobody here knows about?' },
  { title: 'Share a song you have had on repeat lately - and why it hits' },
  { title: 'What app or tool do you absolutely love right now that not many people know?' },
  { title: 'What is the best thing you have watched, read or played recently?' },
  { title: 'Describe your current project like you are explaining it to your grandma' },
  { title: 'What was your worst job ever - and what did it teach you?' },
  { title: 'Coffee order + a weird habit you have while working' },
  { title: 'If you could instantly become world-class at one skill, which one and why?' },
];

// Icebreakers posted when two people get matched
const icebreakers = [
  'What is a small thing that made you smile this week? :relieved:',
  'What are you currently building or learning - and what is actually fun about it?',
  'What is your perfect Friday plan in 3 emojis?',
  'What skill do you want to grow over the next year? :seedling:',
  'Tell me about your team in exactly 3 emojis - and let the other person guess!',
  'What was your very first job?',
  'If work did not exist, what would you be doing right now?',
  'Coffee order? This one matters. :coffee:',
];

// Replies the bot sends to DMs / group DMs (canned "AI agent")
const chatter = [
  'I am just a tiny bot, but I am cheering for you two. :sparkles:',
  'Reminder: this is a 15-minute friendly chat, not a job interview. :coffee:',
  'No agenda, no slides. Just humans being humans. :sunny:',
  'Someone should propose a time. Past you will thank you. :dart:',
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickTheme() {
  const index = weekIndex();
  return themes[index % themes.length];
}

function weekIndex() {
  const now = new Date();
  const started = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - started.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

module.exports = { pick, icebreakers, chatter, pickTheme };
