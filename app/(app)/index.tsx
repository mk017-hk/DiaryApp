import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon, PressableScale, SectionHeader, Text } from '@/components';
import { space, useTheme, type Palette } from '@/design';
import { AssistantQuestion, dailyPrompt, personalGreeting } from '@/features/assistant';
import {
  calendarMarks,
  CycleRing,
  cycleOn,
  DayCell,
  ENERGY,
  labelFor,
  PHASE_LABELS,
  segmentsFor,
  SYMPTOMS,
  useCycle,
  type DayLog,
} from '@/features/cycle';
import {
  addQuietDates,
  datesWithEntries,
  listEntries,
  onThisDay,
  openThreads,
  rangeAround,
  updateEntry,
  useEntryChanges,
  useSync,
  type Entry,
  type Thread,
} from '@/features/entries';
import { isOpenable, listLetters, type Letter } from '@/features/letters';
import { articleForPhase } from '@/features/library';
import { EntryCard } from '@/features/entries/EntryCard';
import { useProfile } from '@/features/profile';
import { LatestNotes } from '@/features/reflections';
import { DEFAULT_EMOTIONS } from '@/services/supabase/emotions';
import {
  daysBetween,
  fromDateKey,
  longDate,
  shortDate,
  weekdayShort,
  weekOf,
  yearsAgo,
} from '@/lib/date';

/**
 * Today.
 *
 * Laid out the way a cycle tracker is — a week across the top, a circle in the
 * middle that says where you are, a check-in, and a row of small cards worth a
 * look — because that layout is good at one thing this app needs: telling you
 * in a glance where you are today and what is worth doing about it.
 *
 * The diary is still the heart of it. With cycle tracking off, the circle holds
 * the day's question instead; with it on, the question sits directly below.
 */
export default function Today() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { name, tone, intentions, capture } = useProfile();
  const { state: syncState, pending } = useSync();
  const cycle = useCycle();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<Entry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [entryDays, setEntryDays] = useState<Set<string>>(new Set());
  const [clock, setClock] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [all, resurfaced, stories, sealed, days] = await Promise.all([
      listEntries(),
      onThisDay(),
      openThreads(),
      listLetters(),
      datesWithEntries(),
    ]);
    setEntries(all);
    setMemories(resurfaced);
    setThreads(stories);
    setLetters(sealed);
    setEntryDays(days);
    setClock(new Date());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEntryChanges(() => void load());

  const today = cycle.today;
  const day = selected ?? today;
  const tracking = cycle.settings.enabled;

  const week = useMemo(() => weekOf(day), [day]);
  const marks = useMemo(
    () =>
      tracking
        ? calendarMarks(
            week[0] ?? day,
            week[6] ?? day,
            today,
            cycle.periodDays,
            cycle.periods,
            cycle.summary,
          )
        : new Map(),
    [tracking, week, day, today, cycle.periodDays, cycle.periods, cycle.summary],
  );

  if (clock === null) return <View style={{ flex: 1, backgroundColor: theme.colors.canvas }} />;

  const answeredToday = entries.some((entry) => entry.entryDate === today);
  const latest = entries[0];
  const question = dailyPrompt({
    name,
    tone,
    intentions,
    daysSinceLast: latest === undefined ? null : daysBetween(latest.entryDate, today),
    hasEntryToday: answeredToday,
  });
  const greeting = personalGreeting(name, tone, clock);
  const ringSize = Math.min(width - space.lg * 2, 300);

  const write = (mode: 'write' | 'video' | 'voice') => router.push(`/compose?mode=${mode}`);
  const primaryCapture = capture === 'write' ? 'write' : 'video';

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <PressableScale
            onPress={() => router.push('/you')}
            accessibilityLabel="You: your account and settings"
            style={[styles.avatar, { backgroundColor: theme.colors.accentWash }]}
          >
            <Text variant="label" color="accent">
              {name.length > 0 ? name.charAt(0).toUpperCase() : '·'}
            </Text>
          </PressableScale>

          <View style={styles.headerTitle}>
            <Text variant="label">{longDate(clock)}</Text>
            {syncState === 'offline' && pending > 0 && (
              <Text variant="caption" color="inkTertiary">
                Saved here · {pending} to send
              </Text>
            )}
          </View>

          <View style={styles.headerActions}>
            <PressableScale
              onPress={() => router.push('/search')}
              accessibilityLabel="Search your diary"
            >
              <Icon name="magnify" color="ink" />
            </PressableScale>
            <PressableScale
              onPress={() => router.push('/calendar')}
              accessibilityLabel="Open the calendar"
            >
              <Icon name="calendar-month-outline" color="ink" />
            </PressableScale>
          </View>
        </View>

        {/* ── The week ───────────────────────────────────────── */}
        <View style={styles.week}>
          {week.map((date) => (
            <View key={date} style={styles.weekDay}>
              <Text variant="caption" color={date === today ? 'accent' : 'inkTertiary'}>
                {date === today ? 'Today' : weekdayShort(date).charAt(0)}
              </Text>
              <DayCell
                date={date}
                mark={marks.get(date)}
                isToday={date === today}
                selected={date === day && date !== today}
                hasEntry={entryDays.has(date)}
                hasLog={cycle.logs.has(date)}
                future={daysBetween(today, date) > 0}
                onPress={(tapped) => setSelected(tapped === today ? null : tapped)}
              />
            </View>
          ))}
        </View>

        {/* ── The circle ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
          {tracking ? (
            <CycleHero
              size={ringSize}
              day={day}
              onLogPeriod={() => router.push('/period')}
              onLogDay={() => router.push(`/log?date=${day}`)}
            />
          ) : (
            <CycleRing size={ringSize} total={1} segments={[]}>
              {greeting.length > 0 && (
                <Text variant="label" color="onHero" align="center">
                  {greeting}
                </Text>
              )}
              <Text variant="title2" color="onHero" align="center" numberOfLines={5}>
                {question}
              </Text>
              <HeroButton
                label={
                  answeredToday
                    ? 'Add another moment'
                    : primaryCapture === 'write'
                      ? 'Write today'
                      : 'Record today'
                }
                onPress={() => write(primaryCapture)}
              />
            </CycleRing>
          )}
          {tracking && (
            <Text variant="caption" color="inkTertiary" align="center" style={styles.disclaimer}>
              Predictions are estimates from your logged periods. They are not contraception.
            </Text>
          )}
        </Animated.View>

        <View style={styles.body}>
          {/* ── Check-in ─────────────────────────────────────── */}
          <CheckIn
            date={day}
            log={cycle.logs.get(day)}
            isToday={day === today}
            onOpen={() => router.push(`/log?date=${day}`)}
          />

          {/* ── The question, when the circle is the cycle ───── */}
          {tracking && (
            <Card>
              <Text variant="overline" color="inkTertiary">
                {greeting.length > 0 ? greeting : 'Today'}
              </Text>
              <View style={styles.question}>
                <AssistantQuestion fallback={question} variant="title2" />
              </View>
              <CaptureRow onCapture={write} />
            </Card>
          )}
          {!tracking && <CaptureRow onCapture={write} />}

          {/* ── The assistant's notes on the latest entry ───── */}
          <LatestNotes />

          {/* ── Daily insights ───────────────────────────────── */}
          <View>
            <SectionHeader title="For you today" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stories}
              style={styles.storiesScroller}
            >
              {storyCards({
                tracking,
                cycle,
                memories,
                letters,
                today,
                entries,
                router,
              }).map(({ key, ...card }) => (
                <StoryCard key={key} {...card} />
              ))}
            </ScrollView>
          </View>

          {/* ── On this day ──────────────────────────────────── */}
          {memories.length > 0 && (
            <View>
              <SectionHeader title="On this day" />
              <View style={styles.stack}>
                {memories.slice(0, 2).map((memory) => (
                  <MemoryCard
                    key={memory.id}
                    entry={memory}
                    onPress={() => router.push(`/entry/${memory.id}`)}
                    onNotThis={() => offerToStopResurfacing(memory, load, router)}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Threads ──────────────────────────────────────── */}
          {threads.length > 0 && (
            <View>
              <SectionHeader
                title="What you’re in the middle of"
                action={{ label: 'All', onPress: () => router.push('/threads') }}
              />
              <Card>
                {threads.slice(0, 4).map((thread, index) => (
                  <PressableScale
                    key={thread.id}
                    onPress={() => router.push(`/thread/${thread.id}`)}
                    accessibilityLabel={`Open the thread ${thread.title}`}
                    style={[
                      styles.threadRow,
                      index > 0 && {
                        borderTopColor: theme.colors.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Icon name="book-open-page-variant-outline" color="accent" />
                    <View style={styles.flex}>
                      <Text variant="bodyMedium">{thread.title}</Text>
                      <Text variant="caption" color="inkTertiary">
                        {countFor(entries, thread)}
                        {thread.isPrivate ? ' · private' : ''}
                      </Text>
                    </View>
                    <Icon name="chevron-right" color="inkFaint" />
                  </PressableScale>
                ))}
              </Card>
            </View>
          )}

          {/* ── Recently ─────────────────────────────────────── */}
          {entries.length > 0 ? (
            <View>
              <SectionHeader
                title="Recently"
                action={{ label: 'Saved', onPress: () => router.push('/saved') }}
              />
              <View style={styles.stack}>
                {entries.slice(0, 5).map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onPress={() => router.push(`/entry/${entry.id}`)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Card tone="surface">
              <Text variant="callout" color="inkSecondary">
                Nothing here yet. Whatever you record first will live here, and in a year it will
                find its way back to you.
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── The cycle circle ─────────────────────────────────────────────────────

function CycleHero({
  size,
  day,
  onLogPeriod,
  onLogDay,
}: {
  size: number;
  day: string;
  onLogPeriod: () => void;
  onLogDay: () => void;
}) {
  const { today, now, periods, summary, periodDays } = useCycle();
  const isToday = day === today;
  const future = daysBetween(today, day) > 0;

  const total = Math.max(summary.averageCycle, now.dayOfCycle ?? 0);
  const segments = segmentsFor(today, now, summary.averagePeriod, total);
  const marker = isToday ? (now.dayOfCycle ?? undefined) : undefined;

  // No period logged yet: the circle asks for the one tap everything needs.
  if (now.dayOfCycle === null && periods.length === 0) {
    return (
      <CycleRing size={size} total={summary.averageCycle} segments={[]}>
        <Text variant="label" color="onHero" align="center">
          Your cycle
        </Text>
        <Text variant="title2" color="onHero" align="center">
          When did your last period start?
        </Text>
        <HeroButton label="Log period" onPress={onLogPeriod} />
      </CycleRing>
    );
  }

  let caption: string;
  let headline: string;
  let detail: string;

  if (isToday) {
    if (now.inPeriod) {
      caption = 'Period';
      headline = `Day ${String(now.periodDay ?? 1)}`;
      detail = periodDays.has(today) ? 'Logged for today' : 'Expected to continue';
    } else if (now.daysLate > 0) {
      caption = 'Period';
      headline = now.daysLate === 1 ? '1 day late' : `${String(now.daysLate)} days late`;
      detail = 'Cycles vary. Log it when it comes.';
    } else if (now.daysUntilNext === 0) {
      caption = 'Period';
      headline = 'Expected today';
      detail = `Cycle day ${String(now.dayOfCycle ?? 1)}`;
    } else {
      caption = 'Period in';
      headline = now.daysUntilNext === 1 ? '1 day' : `${String(now.daysUntilNext ?? 0)} days`;
      detail = `Cycle day ${String(now.dayOfCycle ?? 1)}${now.phase !== null ? ` · ${PHASE_LABELS[now.phase]}` : ''}`;
    }
  } else {
    // Another day in the week: what is, or what is expected.
    const then = cycleOn(day, periods, summary);
    caption = longDate(fromDateKey(day));
    if (periodDays.has(day)) {
      headline = 'Period';
      detail = then.dayOfCycle !== null ? `Cycle day ${String(then.dayOfCycle)}` : 'Logged';
    } else if (
      future &&
      now.nextPeriod !== null &&
      daysBetween(now.nextPeriod, day) >= 0 &&
      daysBetween(day, now.nextPeriod) > -summary.averagePeriod
    ) {
      headline = 'Period expected';
      detail = 'An estimate';
    } else if (then.dayOfCycle !== null) {
      headline = `Cycle day ${String(then.dayOfCycle)}`;
      detail = then.phase !== null ? PHASE_LABELS[then.phase] : '';
    } else {
      headline = 'Before your first logged period';
      detail = '';
    }
  }

  return (
    <CycleRing
      size={size}
      total={total}
      segments={segments}
      {...(marker !== undefined ? { marker } : {})}
    >
      <Text variant="label" color="onHero" align="center">
        {caption}
      </Text>
      <Text variant="display" color="onHero" align="center" numberOfLines={2} adjustsFontSizeToFit>
        {headline}
      </Text>
      {detail.length > 0 && (
        <Text variant="callout" color="onHero" align="center">
          {detail}
        </Text>
      )}
      {isToday ? (
        <HeroButton
          label={now.inPeriod ? 'Edit period dates' : 'Log period'}
          onPress={onLogPeriod}
        />
      ) : (
        !future && <HeroButton label="Log this day" onPress={onLogDay} />
      )}
    </CycleRing>
  );
}

function HeroButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.heroButton, { backgroundColor: theme.colors.card }]}
    >
      <Text variant="label" color="accent">
        {label}
      </Text>
    </PressableScale>
  );
}

// ── Check-in ─────────────────────────────────────────────────────────────

function CheckIn({
  date,
  log,
  isToday,
  onOpen,
}: {
  date: string;
  log: DayLog | undefined;
  isToday: boolean;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const summary = log === undefined ? [] : logSummary(log);

  return (
    <Card
      onPress={onOpen}
      accessibilityLabel={isToday ? 'Check in for today' : `Log ${shortDate(date)}`}
    >
      <View style={styles.checkInTop}>
        <View style={styles.flex}>
          <Text variant="title3">
            {isToday ? 'How are you today?' : `How was ${shortDate(date)}?`}
          </Text>
          <Text variant="caption" color="inkTertiary" numberOfLines={2}>
            {summary.length > 0 ? summary.join(' · ') : 'Mood, symptoms, flow, sleep and more'}
          </Text>
        </View>
        <View style={[styles.plus, { backgroundColor: theme.colors.accent }]}>
          <Icon name={summary.length > 0 ? 'pencil' : 'plus'} color="onAccent" />
        </View>
      </View>
      <View style={styles.checkInIcons}>
        {(
          [
            ['emoticon-outline', 'Mood'],
            ['lightning-bolt-outline', 'Symptoms'],
            ['water-outline', 'Flow'],
            ['sleep', 'Sleep'],
            ['cup-water', 'Water'],
          ] as const
        ).map(([icon, label]) => (
          <View key={label} style={styles.checkInIcon}>
            <View style={[styles.checkInWell, { backgroundColor: theme.colors.accentWash }]}>
              <Icon name={icon} size={20} color="accent" />
            </View>
            <Text variant="caption" color="inkSecondary">
              {label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function logSummary(log: DayLog): string[] {
  const parts: string[] = [];
  if (log.flow !== undefined)
    parts.push(`${log.flow.charAt(0).toUpperCase()}${log.flow.slice(1)} flow`);
  else if (log.period) parts.push('Period');
  for (const slug of log.moods.slice(0, 2)) {
    parts.push(DEFAULT_EMOTIONS.find((emotion) => emotion.slug === slug)?.label ?? slug);
  }
  for (const id of log.symptoms.filter((s) => s !== 'none').slice(0, 2))
    parts.push(labelFor(SYMPTOMS, id));
  if (log.energy !== undefined) parts.push(`${labelFor(ENERGY, log.energy)} energy`);
  if (log.sleepHours !== undefined) parts.push(`${String(log.sleepHours)}h sleep`);
  if (log.water !== undefined) parts.push(`${String(log.water)} glasses`);
  return parts;
}

function CaptureRow({ onCapture }: { onCapture: (mode: 'write' | 'video' | 'voice') => void }) {
  const theme = useTheme();
  return (
    <View style={styles.captureRow}>
      {(
        [
          ['write', 'pencil-outline', 'Write'],
          ['video', 'video-outline', 'Record'],
          ['voice', 'microphone-outline', 'Voice'],
        ] as const
      ).map(([mode, icon, label]) => (
        <PressableScale
          key={mode}
          onPress={() => onCapture(mode)}
          haptic="light"
          accessibilityLabel={`${label} an entry`}
          style={[styles.captureButton, { backgroundColor: theme.colors.accentWash }]}
        >
          <Icon name={icon} size={20} color="accent" />
          <Text variant="label" color="accent">
            {label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

// ── Story cards ──────────────────────────────────────────────────────────

interface Story {
  key: string;
  overline: string;
  title: string;
  icon: string;
  tone: Extract<keyof Palette, 'accentWash' | 'periodWash' | 'fertileWash' | 'surface'>;
  onPress: () => void;
}

function storyCards({
  tracking,
  cycle,
  memories,
  letters,
  today,
  entries,
  router,
}: {
  tracking: boolean;
  cycle: ReturnType<typeof useCycle>;
  memories: Entry[];
  letters: Letter[];
  today: string;
  entries: Entry[];
  router: ReturnType<typeof useRouter>;
}): Story[] {
  const cards: Story[] = [];

  if (tracking) {
    const article = articleForPhase(cycle.now.phase);
    if (article !== undefined) {
      cards.push({
        key: 'phase',
        overline:
          cycle.now.dayOfCycle !== null
            ? `Cycle day ${String(cycle.now.dayOfCycle)}`
            : 'Your cycle',
        title: article.title,
        icon: article.icon,
        tone:
          cycle.now.phase === 'period'
            ? 'periodWash'
            : cycle.now.phase === 'fertile' || cycle.now.phase === 'ovulation'
              ? 'fertileWash'
              : 'accentWash',
        onPress: () => router.push(`/library/${article.id}`),
      });
    }
    if (cycle.summary.cycles.length > 0) {
      cards.push({
        key: 'cycles',
        overline: 'Your cycles',
        title: `About ${String(cycle.summary.averageCycle)} days, on average`,
        icon: 'chart-timeline-variant',
        tone: 'surface',
        onPress: () => router.push('/insights'),
      });
    }
  }

  const memory = memories[0];
  if (memory !== undefined) {
    const years = yearsAgo(fromDateKey(memory.entryDate));
    cards.push({
      key: 'memory',
      overline: years === 1 ? 'A year ago' : `${String(years)} years ago`,
      title: memory.body.length > 0 ? memory.body : 'A moment you recorded',
      icon: 'history',
      tone: 'accentWash',
      onPress: () => router.push(`/entry/${memory.id}`),
    });
  }

  const ready = letters.filter((letter) => isOpenable(letter, today));
  const waiting = letters
    .filter((letter) => !isOpenable(letter, today) && letter.unlockedAt === undefined)
    .sort((a, b) => a.unlockOn.localeCompare(b.unlockOn))[0];
  if (ready.length > 0) {
    cards.push({
      key: 'letter-ready',
      overline: 'A letter',
      title:
        ready.length === 1
          ? 'A letter from you is ready to open'
          : `${String(ready.length)} letters are ready`,
      icon: 'email-open-outline',
      tone: 'periodWash',
      onPress: () => router.push('/letters'),
    });
  } else if (waiting !== undefined) {
    const days = daysBetween(today, waiting.unlockOn);
    cards.push({
      key: 'letter-waiting',
      overline: 'Sealed',
      title: days === 1 ? 'A letter opens tomorrow' : `A letter opens in ${String(days)} days`,
      icon: 'email-lock-outline',
      tone: 'surface',
      onPress: () => router.push('/letters'),
    });
  } else {
    cards.push({
      key: 'letter-new',
      overline: 'Future you',
      title: 'Write a letter to open next year',
      icon: 'email-edit-outline',
      tone: 'surface',
      onPress: () => router.push('/letters'),
    });
  }

  if (entries.length >= 3) {
    cards.push({
      key: 'patterns',
      overline: 'Patterns',
      title: 'How the last month has felt',
      icon: 'chart-bell-curve-cumulative',
      tone: 'fertileWash',
      onPress: () => router.push('/patterns'),
    });
  }

  if (!tracking) {
    cards.push({
      key: 'cycle-offer',
      overline: 'Cycle',
      title: 'Track your cycle alongside your diary',
      icon: 'sync',
      tone: 'periodWash',
      onPress: () => router.push('/cycle-settings'),
    });
  }

  return cards;
}

function StoryCard({ overline, title, icon, tone, onPress }: Omit<Story, 'key'>) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={`${overline}: ${title}`}
      style={[styles.story, { backgroundColor: theme.colors[tone], borderRadius: theme.radius.lg }]}
    >
      <View style={[styles.storyIcon, { backgroundColor: theme.colors.card }]}>
        <Icon name={icon} size={20} color="accent" />
      </View>
      <View style={styles.storyText}>
        <Text variant="caption" color="inkTertiary">
          {overline}
        </Text>
        <Text variant="label" numberOfLines={4}>
          {title}
        </Text>
      </View>
    </PressableScale>
  );
}

// ── Diary rows ───────────────────────────────────────────────────────────

function countFor(entries: Entry[], thread: Thread): string {
  const count = entries.filter((entry) => entry.threadId === thread.id).length;
  return count === 0 ? 'Nothing in it yet' : `${String(count)} so far`;
}

/**
 * Offers the ways to stop a memory coming back, on the card itself, because
 * this is the moment somebody finds out they did not want it.
 */
function offerToStopResurfacing(
  entry: Entry,
  reload: () => void,
  router: { push: (path: string) => void },
): void {
  Alert.alert(
    'Stop bringing this back?',
    'Nothing is deleted either way. This only changes what I put in front of you.',
    [
      {
        text: 'Not this entry again',
        onPress: () => {
          void (async () => {
            await updateEntry(entry.id, { resurfaceExcluded: true });
            reload();
          })();
        },
      },
      {
        text: 'Keep this date quiet',
        onPress: () => {
          void (async () => {
            const date = fromDateKey(entry.entryDate);
            await addQuietDates(rangeAround(date.getMonth() + 1, date.getDate(), 0));
            reload();
          })();
        },
      },
      { text: 'More options', onPress: () => router.push('/quiet-dates') },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}

function MemoryCard({
  entry,
  onPress,
  onNotThis,
}: {
  entry: Entry;
  onPress: () => void;
  onNotThis: () => void;
}) {
  const years = yearsAgo(fromDateKey(entry.entryDate));
  return (
    <Card tone="accentWash">
      <PressableScale
        onPress={onPress}
        haptic="light"
        accessibilityLabel={`Memory from ${String(years)} years ago`}
        style={styles.memoryBody}
      >
        <Text variant="caption" color="inkSecondary">
          {years === 1 ? 'A year ago today' : `${String(years)} years ago today`}
        </Text>
        <Text variant="title3" numberOfLines={3}>
          {entry.body.length > 0 ? entry.body : 'A moment you recorded'}
        </Text>
      </PressableScale>
      <PressableScale
        onPress={onNotThis}
        haptic="light"
        accessibilityLabel="Stop bringing this back"
        style={styles.memoryOut}
      >
        <Text variant="caption" color="inkTertiary">
          Not this
        </Text>
      </PressableScale>
    </Card>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  body: { gap: space.lg, paddingHorizontal: space.lg },
  captureButton: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    flexDirection: 'row',
    gap: space.xxs,
    justifyContent: 'center',
    minHeight: 44,
  },
  captureRow: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  checkInIcon: { alignItems: 'center', gap: space.xxs },
  checkInIcons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md },
  checkInTop: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  checkInWell: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  disclaimer: { marginTop: space.sm, paddingHorizontal: space.xl },
  entryMeta: { alignItems: 'center', flexDirection: 'row', gap: space.xxs },
  entryRow: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  headerActions: { flexDirection: 'row', gap: space.md },
  headerTitle: { alignItems: 'center', flex: 1 },
  hero: { alignItems: 'center', marginBottom: space.lg, marginTop: space.md },
  heroButton: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: space.sm,
    minHeight: 40,
    paddingHorizontal: space.lg,
  },
  memoryBody: { gap: space.xxs },
  memoryOut: { alignSelf: 'flex-end', paddingHorizontal: space.xxs, paddingTop: space.xs },
  plus: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  question: { marginTop: space.xs },
  stack: { gap: space.sm },
  stories: { gap: space.sm, paddingHorizontal: space.lg },
  storiesScroller: { marginHorizontal: -space.lg },
  story: {
    gap: space.md,
    height: 168,
    justifyContent: 'space-between',
    padding: space.md,
    width: 148,
  },
  storyIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  storyText: { gap: 2 },
  threadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  week: { flexDirection: 'row', marginTop: space.md, paddingHorizontal: space.sm },
  weekDay: { alignItems: 'center', flex: 1, gap: space.xxs },
});
