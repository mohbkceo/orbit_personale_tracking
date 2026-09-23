import { sendTelegramNotification } from '../../telegram/notifier.js';
import { getSettingsDocument } from '../settingsService.js';

function actions(reminder) {
  const id = reminder._id;
  if (reminder.metadata?.automation === 'focus-evening') return (reminder.metadata.items || []).flatMap((item) => [
    [{ text: `↪ ${item.title.slice(0, 20)}`, callbackData: `f:tomorrow:${reminder.metadata.date}:${item.id}` }],
    [{ text: 'Backlog', callbackData: `f:backlog:${reminder.metadata.date}:${item.id}` }, { text: 'Choose date', callbackData: `f:reschedule:${reminder.metadata.date}:${item.id}` }, { text: 'Drop', callbackData: `f:drop:${reminder.metadata.date}:${item.id}` }],
  ]);
  if (reminder.metadata?.automation === 'focus-morning') return [[{ text: 'Finish planning', callbackData: 'f:done' }]];
  if (reminder.entityType === 'task' && reminder.metadata?.automation) {
    if (reminder.metadata.escalationLevel >= 2 || reminder.metadata.band === 'overdue') return [
      [{ text: 'Start now', callbackData: `r:start:${id}` }, { text: 'Choose date', callbackData: `r:date:${id}` }],
      [{ text: 'Backlog', callbackData: `r:backlog:${id}` }, { text: 'Drop', callbackData: `r:drop:${id}` }],
    ];
    if (reminder.metadata.automation === 'checkin') return [
      [{ text: 'Continue', callbackData: `r:continue:${id}` }, { text: 'Done', callbackData: `r:done:${id}` }],
      [{ text: 'Blocked', callbackData: `r:block:${id}` }, { text: 'Stop for now', callbackData: `r:stop:${id}` }],
    ];
    if (reminder.metadata.escalationLevel === 1) return [
      [{ text: 'Start now', callbackData: `r:start:${id}` }, { text: 'No time', callbackData: `r:notime:${id}` }],
      [{ text: 'Blocked', callbackData: `r:block:${id}` }, { text: 'Not important', callbackData: `r:notimportant:${id}` }],
    ];
    if (reminder.metadata.needsAction) return [
      [{ text: 'Set next action', callbackData: `r:next:${id}` }, { text: 'Start', callbackData: `r:start:${id}` }],
      [{ text: 'Later', callbackData: `r:later:${id}` }, { text: 'Blocked', callbackData: `r:block:${id}` }, { text: 'Done', callbackData: `r:done:${id}` }],
    ];
    return [[{ text: 'Start', callbackData: `r:start:${id}` }, { text: 'Later', callbackData: `r:later:${id}` }, { text: 'Blocked', callbackData: `r:block:${id}` }, { text: 'Done', callbackData: `r:done:${id}` }]];
  }
  if (reminder.entityType === 'debt')
    return [
      [
        { text: 'Paid', callbackData: `r:paid:${id}` },
        { text: 'Partial', callbackData: `r:partial:${id}` },
        { text: 'Later', callbackData: `r:later:${id}` },
      ],
    ];
  if (reminder.entityType === 'bill')
    return [
      [
        { text: 'Paid', callbackData: `r:paid:${id}` },
        { text: 'Later', callbackData: `r:later:${id}` },
      ],
    ];
  if (reminder.entityType === 'subscription')
    return [
      [
        { text: 'Later', callbackData: `r:later:${id}` },
        { text: 'Blocked', callbackData: `r:block:${id}` },
      ],
    ];
  if (reminder.entityType === 'goal')
    return [
      [
        { text: 'Add progress', callbackData: `r:progress:${id}` },
        { text: 'Create next task', callbackData: `r:nexttask:${id}` },
      ],
      [
        { text: 'Skip review', callbackData: `r:done:${id}` },
        { text: 'Later', callbackData: `r:later:${id}` },
      ],
    ];
  return [
    [
      { text: '✓ Done', callbackData: `r:done:${id}` },
      { text: '⏰ Later', callbackData: `r:later:${id}` },
      { text: '⛔ Blocked', callbackData: `r:block:${id}` },
    ],
  ];
}

export async function deliverReminder(reminder) {
  const settings = await getSettingsDocument(reminder.user);
  const telegram =
    settings.reminders?.deliveryChannels?.telegram !== false &&
    reminder.deliveryChannels.includes('telegram');
  const web =
    settings.reminders?.deliveryChannels?.web !== false &&
    reminder.deliveryChannels.includes('web');
  if (!telegram) return { sent: 0, web };
  try {
    const message =
      reminder.followUpCount > 0 || (reminder.followUp?.enabled && reminder.triggerCount > 0)
        ? `Still need to handle this?\n${reminder.message || reminder.title}`
        : reminder.message || 'This is ready to handle.';
    const title =
      reminder.entityType === 'goal'
        ? `🎯 Weekly goal review: ${reminder.title}`
        : `🔔 ${reminder.title}`;
    const result = await sendTelegramNotification(reminder.user, {
      title,
      message,
      buttons: actions(reminder),
    });
    return { ...result, web };
  } catch (error) {
    if (!web) throw error;
    return { sent: 0, web, telegramError: error.message };
  }
}

export async function deliverReminderBundle(reminders) {
  const settings = await getSettingsDocument(reminders[0].user);
  const web =
    settings.reminders?.deliveryChannels?.web !== false &&
    reminders.some((item) => item.deliveryChannels.includes('web'));
  if (
    settings.reminders?.deliveryChannels?.telegram === false ||
    !reminders.some((item) => item.deliveryChannels.includes('telegram'))
  )
    return { sent: 0, web };
  const buttons = reminders.map((item) => [
    { text: `✓ ${item.title.slice(0, 22)}`, callbackData: `r:done:${item._id}` },
    { text: 'Later', callbackData: `r:later:${item._id}` },
  ]);
  try {
    const result = await sendTelegramNotification(reminders[0].user, {
      title: `☀️ ${reminders.length} things worth handling`,
      message: reminders.map((item) => `□ ${item.title}`).join('\n'),
      buttons,
    });
    return { ...result, web };
  } catch (error) {
    if (!web) throw error;
    return { sent: 0, web, telegramError: error.message };
  }
}
