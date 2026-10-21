// All Block Kit builders live here: welcome card, preferences modal, match card.
const { pick, icebreakers } = require('./content');

const FREQ_OPTIONS = [
  { value: 'weekly', label: 'Weekly :calendar:' },
  { value: 'fortnightly', label: 'Fortnightly (every 2 weeks)' },
  { value: 'monthly', label: 'Monthly (every 4 weeks)' },
];

const INTENT_OPTIONS = [
  { value: 'social', label: 'Coffee & small talk :coffee:' },
  { value: 'group', label: 'Fun & games :jigsaw:' },
  { value: 'learning', label: 'Skill learning :books:' },
];

function selectOptions(options) {
  return options.map((o) => ({
    text: { type: 'plain_text', text: o.label, emoji: true },
    value: o.value,
  }));
}

function prefsModal() {
  return {
    type: 'modal',
    callback_id: 'coffee_prefs_submit',
    title: { type: 'plain_text', text: 'Coffee Matchup' },
    submit: { type: 'plain_text', text: "Let's go :coffee:", emoji: true },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Two quick questions and I will find you a catchup buddy! :clap:',
        },
      },
      {
        type: 'input',
        block_id: 'frequency_block',
        label: { type: 'plain_text', text: 'How often do you want to catch up?' },
        element: {
          type: 'static_select',
          action_id: 'frequency_select',
          placeholder: { type: 'plain_text', text: 'Pick a cadence' },
          options: selectOptions(FREQ_OPTIONS),
        },
      },
      {
        type: 'input',
        block_id: 'intent_block',
        label: { type: 'plain_text', text: 'What kind of catchup are you after?' },
        element: {
          type: 'static_select',
          action_id: 'intent_select',
          placeholder: { type: 'plain_text', text: 'Pick a vibe' },
          options: selectOptions(INTENT_OPTIONS),
        },
      },
    ],
  };
}

function welcomeBlocks() {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: ':coffee: Hi there! Welcome to *Coffee Matchup*.\n\nI randomly match you with a teammate for a relaxed chat - you pick how often and what vibe, and I handle the rest.',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'open_tastes_modal',
          text: { type: 'plain_text', text: 'Set my taste :coffee:' },
          value: 'open',
        },
      ],
    },
  ];
}

function matchBlocks(a, b, themeTitle) {
  const intro = b
    ? `Hey <@${a.id}> and <@${b.id}> - the randomizer paired you for a chill catchup chat. :tada:`
    : `Hey <@${a.id}> - no buddy up for grabs this round, so this is a *solo self-catchup*. Grab a coffee and treat yourself! :sunny:`;

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: b ? ':coffee: You two match!' : ':coffee: Solo catchup!', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: intro },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Theme of the round:* ${themeTitle}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Icebreaker:* ${pick(icebreakers)}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'match_snooze',
          text: { type: 'plain_text', text: 'Snooze this :zzz:' },
          value: 'snooze',
        },
        {
          type: 'button',
          action_id: 'match_skip',
          text: { type: 'plain_text', text: 'Skip this round' },
          style: 'danger',
          value: 'skip',
          confirm: {
            title: { type: 'plain_text', text: 'Skip this round?' },
            text: { type: 'plain_text', text: 'You will sit this one out and get matched again next time.' },
            confirm: { type: 'plain_text', text: 'Skip' },
            deny: { type: 'plain_text', text: 'Actually, chat' },
          },
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Tip: 15 minutes is the sweet spot. No agenda needed.' }],
    },
  ];
}

module.exports = { prefsModal, welcomeBlocks, matchBlocks };
