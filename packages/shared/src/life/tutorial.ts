export type TutorialStep = 'eat' | 'job' | 'shift' | 'sleep' | 'decorate' | 'rent';

export const TUTORIAL: { id: TutorialStep; title: string; hint: string }[] = [
  { id: 'eat', title: 'Grab a bite', hint: 'Walk to a restaurant and buy something to eat.' },
  {
    id: 'job',
    title: 'Get a job',
    hint: 'Visit the kitchen, the bar or the hospital and take a job.',
  },
  { id: 'shift', title: 'Work a shift', hint: 'Stay at work until the shift ends to get paid.' },
  { id: 'sleep', title: 'Sleep at home', hint: 'Go home and rest in your bed.' },
  {
    id: 'decorate',
    title: 'Make it yours',
    hint: 'Buy a piece of furniture and place it in your home.',
  },
  {
    id: 'rent',
    title: 'Pay your first rent',
    hint: 'Rent is due after an hour in the city. Keep money in the bank.',
  },
];

export type TutorialState = Partial<Record<TutorialStep, true>>;

export const isTutorialStep = (v: unknown): v is TutorialStep => TUTORIAL.some((t) => t.id === v);

export const tutorialDone = (state: TutorialState): boolean => TUTORIAL.every((t) => state[t.id]);
