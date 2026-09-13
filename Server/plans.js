
export const PLANS = {
  free: {
    assistantMessagesPerMonth: 50,
    manualSyncsPerDay: 10,
    connectedAccounts: 1,
    pushNotifications: true,
    writeActions: false
  },
  plus: {
    assistantMessagesPerMonth: 500,
    manualSyncsPerDay: 100,
    connectedAccounts: 3,
    pushNotifications: true,
    writeActions: true
  },
  pro: {
    assistantMessagesPerMonth: 5000,
    manualSyncsPerDay: 1000,
    connectedAccounts: 10,
    pushNotifications: true,
    writeActions: true
  }
};

export function planFor(user){
  return PLANS[user?.plan] || PLANS.free;
}
