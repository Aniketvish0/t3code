import * as Haptics from "expo-haptics";
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { EnvironmentId } from "@t3tools/contracts";
import { LayoutAnimation, Pressable, useColorScheme, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { scaledTypographyLineHeight } from "../../lib/appearancePreferences";
import { cn } from "../../lib/cn";
import { THREAD_WORK_ROW_MIN_HEIGHT, type deriveThreadWorkLogSizing } from "../../lib/layout";
import type { ThreadFeedActivity } from "../../lib/threadActivity";
import { ThreadActivityInspector } from "./ThreadActivityInspector";

const WORK_LOG_LAYOUT_ANIMATION = {
  duration: 180,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
} as const;

function triggerDisclosureFeedback() {
  LayoutAnimation.configureNext(WORK_LOG_LAYOUT_ANIMATION);
  void Haptics.selectionAsync();
}

function stripShellWrapper(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\/bin\/zsh -lc ['"]?([\s\S]*?)['"]?$/);
  return (match?.[1] ?? trimmed).trim();
}

function compactActivityDetail(detail: string | null): string | null {
  if (!detail) {
    return null;
  }

  const cleaned = stripShellWrapper(detail).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function workRowSymbolName(icon: ThreadFeedActivity["icon"]): AppSymbolName {
  switch (icon) {
    case "agent":
      return { ios: "sparkles", android: "auto_awesome" };
    case "alert":
      return { ios: "exclamationmark.triangle", android: "error" };
    case "check":
      return { ios: "checkmark", android: "check" };
    case "command":
      return { ios: "terminal", android: "terminal" };
    case "edit":
      return { ios: "square.and.pencil", android: "edit" };
    case "eye":
      return { ios: "eye", android: "visibility" };
    case "globe":
      return { ios: "globe", android: "public" };
    case "hammer":
      return { ios: "hammer", android: "construction" };
    case "message":
      return { ios: "bubble.left", android: "chat_bubble" };
    case "warning":
      return { ios: "xmark", android: "close" };
    case "wrench":
      return { ios: "wrench", android: "build" };
    case "zap":
      return { ios: "bolt", android: "bolt" };
  }
}

// Entering fades only for rows created moments ago: rows remount whenever the
// list scrolls them back into view, and old rows must not replay an entrance.
const FRESH_ROW_WINDOW_MS = 3_000;
function isFreshRow(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < FRESH_ROW_WINDOW_MS;
}

// Tool-like activities with a neutral status carry no signal worth a row.
export function visibleWorkLogActivities(
  activities: ReadonlyArray<ThreadFeedActivity>,
): ReadonlyArray<ThreadFeedActivity> {
  return activities.filter((activity) => !(activity.toolLike && activity.status === "neutral"));
}

// Pre-measurement heights for the feed's getFixedItemSize. Collapsed work-log
// rows are single-line (numberOfLines={1}) inside a min-height that stays
// taller than the text at every supported base font size (text-xs reaches
// 23px at the 22pt maximum, under the 32px min-h-8), so row height is
// deterministic. The "work log" label has no such clamp — its height follows
// the scaled text-2xs line height. Values mirror the classNames below — keep
// them in sync; a mismatch only costs a one-time correction on measure.
const WORK_ROW_HEIGHT = 32; // min-h-8
const WORK_ROW_GAP = 1; // gap-px
const WORK_LOG_HEADER_PADDING = 2; // pb-0.5 under the "work log" label
const WORK_LOG_BOTTOM_MARGIN = 4; // mb-1

export const WORK_GROUP_TOGGLE_HEIGHT = THREAD_WORK_ROW_MIN_HEIGHT;

export function collapsedWorkLogHeight(
  activities: ReadonlyArray<ThreadFeedActivity>,
  baseFontSize: number,
): number {
  const rows = visibleWorkLogActivities(activities);
  if (rows.length === 0) {
    return 0;
  }
  const onlyToolRows = rows.every((row) => row.toolLike);
  const headerHeight =
    scaledTypographyLineHeight(MOBILE_TYPOGRAPHY.caption, baseFontSize) + WORK_LOG_HEADER_PADDING;
  return (
    WORK_LOG_BOTTOM_MARGIN +
    (onlyToolRows ? 0 : headerHeight) +
    rows.length * WORK_ROW_HEIGHT +
    (rows.length - 1) * WORK_ROW_GAP
  );
}

export function collapsedWorkLogHeight(activities: ReadonlyArray<ThreadFeedActivity>): number {
  if (activities.length === 0) {
    return 0;
  }
  const height = workLogRowsHeight(activities);
  return (
    WORK_LOG_BOTTOM_MARGIN +
    (activities[0]?.groupedToolDetail ? Math.min(height, WORK_GROUP_MAX_HEIGHT) : height)
  );
}

interface ThreadWorkLogProps {
  readonly activities: ReadonlyArray<ThreadFeedActivity>;
  readonly anchorKey: string;
  readonly copiedRowId: string | null;
  readonly environmentId: EnvironmentId;
  readonly expanded: boolean;
  readonly expandedRows: Readonly<Record<string, boolean>>;
  readonly rowSizing: ReturnType<typeof deriveThreadWorkLogSizing>;
  readonly scrollPositions: Map<string, ThreadWorkGroupScrollPosition>;
  readonly iconSubtleColor: ColorValue;
  readonly onCopyRow: (rowId: string, value: string) => void;
  readonly onToggleRow: (rowId: string) => void;
  readonly workspaceRoot?: string | null;
}) {
  const colorScheme = useColorScheme();
  const pressedBackground = colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";
  const rows = props.activities;

export function ThreadWorkLog(props: ThreadWorkLogProps) {
  const renderRow = useCallback(
    (row: ThreadFeedActivity) => (
      <ThreadWorkLogRow
        key={row.id}
        row={row}
        anchorKey={props.anchorKey}
        copied={props.copiedRowId === row.id}
        expanded={props.expandedRows[row.id] ?? false}
        iconSubtleColor={props.iconSubtleColor}
        onCopyRow={props.onCopyRow}
        onToggleRow={props.onToggleRow}
        renderImage={props.renderImage}
      />
    ),
    [
      props.anchorKey,
      props.copiedRowId,
      props.expandedRows,
      props.iconSubtleColor,
      props.onCopyRow,
      props.onToggleRow,
      props.renderImage,
    ],
  );

  if (props.activities.length === 0) {
    return null;
  }

  const onlyToolRows = rows.every((row) => row.toolLike);

  return (
    <View className="-mx-1 mb-1 px-1 py-0">
      {!onlyToolRows ? (
        <Text className="px-0.5 pb-0.5 font-t3-medium text-2xs text-foreground-muted opacity-60">
          work log
        </Text>
      ) : null}

      <View className="gap-px">
        {rows.map((row) => {
          const expanded = props.expandedRows[row.id] ?? false;
          const canExpand = row.fullDetail !== null;
          const detail = compactActivityDetail(row.detail);
          const displayText = detail ? `${row.summary} ${detail}` : row.summary;
          const iconIsDestructive = row.icon === "alert" || row.icon === "warning";

          return (
            <Animated.View
              key={row.id}
              {...(isFreshRow(row.createdAt) ? { entering: FadeIn.duration(200) } : {})}
            >
              <Pressable
                accessibilityRole={canExpand ? "button" : undefined}
                accessibilityLabel={displayText}
                accessibilityHint={
                  canExpand
                    ? "Double tap to show full details. Long press to copy."
                    : "Long press to copy."
                }
                accessibilityState={canExpand ? { expanded } : undefined}
                hitSlop={4}
                onPress={() => {
                  if (canExpand) {
                    triggerDisclosureFeedback();
                    props.onToggleRow(row.id);
                  }
                }}
                onLongPress={() => props.onCopyRow(row.id, row.getCopyText())}
                className="rounded-md px-0.5 py-0 active:bg-subtle"
              >
                <View className="min-h-8 flex-row items-center gap-1.5">
                  <View className="h-[18px] w-5 shrink-0 items-center justify-center">
                    <SymbolView
                      name={workRowSymbolName(row.icon)}
                      size={13}
                      weight="medium"
                      tintColor={iconIsDestructive ? "#e11d48" : props.iconSubtleColor}
                      type="monochrome"
                    />
                  </View>

                  <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
                    <Text
                      className={cn(
                        "font-t3-medium text-foreground",
                        iconIsDestructive && "text-adaptive-rose-600-400",
                      )}
                    >
                      {row.summary}
                    </Text>
                    {detail ? (
                      <Text className="text-foreground-muted opacity-60"> {detail}</Text>
                    ) : null}
                  </Text>

                  <View className="shrink-0 flex-row items-center gap-px">
                    {props.copiedRowId === row.id ? (
                      <Text className="pr-1 font-t3-medium text-3xs text-adaptive-emerald-600-400">
                        Copied
                      </Text>
                    ) : null}
                    <View className="h-4 w-4 items-center justify-center">
                      {canExpand ? (
                        <ThreadDisclosureChevron
                          expanded={expanded}
                          collapsedDirection="down"
                          size={11}
                          tintColor={props.iconSubtleColor}
                        />
                      ) : null}
                    </View>
                    <View className="h-4 w-4 items-center justify-center">
                      {row.status ? (
                        <SymbolView
                          name={
                            row.status === "failure"
                              ? { ios: "xmark", android: "close" }
                              : row.status === "success"
                                ? { ios: "checkmark", android: "check" }
                                : { ios: "minus", android: "remove" }
                          }
                          size={11}
                          tintColor={props.iconSubtleColor}
                          type="monochrome"
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>

              {expanded && row.fullDetail ? (
                <View className="ml-7 border-l border-neutral-300/60 pb-1.5 pl-3 pt-0.5 dark:border-white/[0.12]">
                  <ThreadActivityInspector
                    activity={row}
                    environmentId={props.environmentId}
                    iconColor={props.iconSubtleColor}
                    workspaceRoot={props.workspaceRoot}
                  />
                </View>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

function ThreadWorkGroupList(props: {
  readonly activities: ReadonlyArray<ThreadFeedActivity>;
  readonly expandedRows: Readonly<Record<string, boolean>>;
  readonly groupId: string;
  readonly rowSizing: ReturnType<typeof deriveThreadWorkLogSizing>;
  readonly scrollPositions: Map<string, ThreadWorkGroupScrollPosition>;
  readonly renderRow: (row: ThreadFeedActivity) => ReactNode;
}) {
  const estimatedRowsHeight = workLogRowsHeight(
    props.activities,
    props.rowSizing.estimatedRowHeight,
  );
  const [initialPosition] = useState(() => {
    const position = props.scrollPositions.get(props.groupId);
    return props.activities.some((row) => row.id === position?.rowId) ? position : undefined;
  });
  const [initialScrollIndex] = useState(() =>
    resolveThreadWorkGroupInitialScroll(props.activities, initialPosition),
  );
  const [restoringPosition, setRestoringPosition] = useState(initialScrollIndex !== undefined);
  const listRef = useRef<LegendListRef>(null);
  const loadedRef = useRef(false);
  const userScrollingRef = useRef(false);
  const pendingAppendHeightRef = useRef<number | null>(null);
  const previousContent = useRef({
    rows: props.activities,
    height: Math.max(estimatedRowsHeight, initialPosition?.contentHeight ?? 0),
    expandedRows: props.expandedRows,
  });
  const [measuredContent, setMeasuredContent] = useState(() => ({
    height: Math.max(estimatedRowsHeight, initialPosition?.contentHeight ?? 0),
    rowCount: props.activities.length,
  }));
  const contentHeight = Math.max(
    1,
    measuredContent.height +
      Math.max(0, props.activities.length - measuredContent.rowCount) *
        (props.rowSizing.estimatedRowHeight + WORK_ROW_GAP),
  );
  const height = Math.min(contentHeight, WORK_GROUP_MAX_HEIGHT);
  const scrollOffset = useSharedValue(initialPosition?.scrollOffset ?? 0);
  const sharedValues = useMemo(() => ({ scrollOffset }), [scrollOffset]);
  const gradientId = `work-group-fade-${useId().replaceAll(":", "")}`;
  const fadeFraction = WORK_GROUP_EDGE_FADE_HEIGHT / height;

  // Opaque covers remove each edge fade at the scroll boundary. Scroll offset
  // stays on the UI thread; only content-size changes update React state.
  const topCoverStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, scrollOffset.value) / WORK_GROUP_EDGE_FADE_HEIGHT),
  }));
  const bottomCoverStyle = useAnimatedStyle(() => ({
    opacity:
      1 -
      Math.min(
        1,
        Math.max(0, contentHeight - height - scrollOffset.value) / WORK_GROUP_EDGE_FADE_HEIGHT,
      ),
  }));
  const rememberPosition = useCallback(() => {
    if (!loadedRef.current) return;
    const state = listRef.current?.getState();
    const position = state && resolveWorkGroupScrollAnchor(state);
    if (!state || !position) return;
    props.scrollPositions.set(props.groupId, {
      ...position,
      contentHeight: state.contentLength,
    });
  }, [props.groupId, props.scrollPositions]);
  const finishPendingAppend = useCallback(() => {
    const targetHeight = pendingAppendHeightRef.current;
    const state = listRef.current?.getState();
    if (
      targetHeight !== null &&
      state &&
      !userScrollingRef.current &&
      Math.abs(state.scrollLength - targetHeight) <= 1
    ) {
      pendingAppendHeightRef.current = null;
      void listRef.current?.scrollToEnd({ animated: false });
    }
  }, []);
  const onContentSizeChange = useCallback(
    (_width: number, nextHeight: number) => {
      const previous = previousContent.current;
      const detailsChanged = previous.expandedRows !== props.expandedRows;
      const followAppend =
        loadedRef.current &&
        shouldFollowThreadWorkGroupAppend({
          previousRows: previous.rows,
          rows: props.activities,
          previousContentHeight: previous.height,
          contentHeight: nextHeight,
          viewportHeight: Math.min(previous.height, WORK_GROUP_MAX_HEIGHT),
          scrollOffset: scrollOffset.value,
          detailsChanged,
          userScrolling: userScrollingRef.current,
        });
      previousContent.current = {
        rows: props.activities,
        height: nextHeight,
        expandedRows: props.expandedRows,
      };
      setMeasuredContent((current) =>
        current.height === nextHeight && current.rowCount === props.activities.length
          ? current
          : { height: nextHeight, rowCount: props.activities.length },
      );
      // Follow new calls only, never a detail toggle or a growing tool result.
      if (followAppend) {
        pendingAppendHeightRef.current = Math.min(nextHeight, WORK_GROUP_MAX_HEIGHT);
      } else if (detailsChanged || userScrollingRef.current || previous.rows !== props.activities) {
        pendingAppendHeightRef.current = null;
      } else if (pendingAppendHeightRef.current !== null) {
        pendingAppendHeightRef.current = Math.min(nextHeight, WORK_GROUP_MAX_HEIGHT);
      }
      // A short group can grow its viewport on this append. Wait for that
      // layout before calculating the end offset, rather than jumping twice.
      finishPendingAppend();
      rememberPosition();
    },
    [props.activities, props.expandedRows, scrollOffset, finishPendingAppend, rememberPosition],
  );
  const getFixedItemSize = useCallback(
    (row: ThreadFeedActivity, index: number) =>
      props.expandedRows[row.id] || props.rowSizing.fixedRowHeight === undefined
        ? undefined
        : props.rowSizing.fixedRowHeight + (index < props.activities.length - 1 ? WORK_ROW_GAP : 0),
    [props.activities.length, props.expandedRows, props.rowSizing.fixedRowHeight],
  );
  const renderItem = useCallback(
    ({ item, index }: { item: ThreadFeedActivity; index: number }) => (
      <View className={index < props.activities.length - 1 ? "pb-px" : undefined}>
        {props.renderRow(item)}
      </View>
    ),
    [props.activities.length, props.renderRow],
  );

  return (
    <MaskedView
      style={{ height }}
      maskElement={
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
                <Stop offset={0} stopColor="white" stopOpacity={0} />
                <Stop offset={fadeFraction} stopColor="white" stopOpacity={1} />
                <Stop offset={1 - fadeFraction} stopColor="white" stopOpacity={1} />
                <Stop offset={1} stopColor="white" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
          <Animated.View
            className="absolute inset-x-0 top-0 bg-white"
            style={[{ height: WORK_GROUP_EDGE_FADE_HEIGHT }, topCoverStyle]}
          />
          <Animated.View
            className="absolute inset-x-0 bottom-0 bg-white"
            style={[{ height: WORK_GROUP_EDGE_FADE_HEIGHT }, bottomCoverStyle]}
          />
        </View>
      }
    >
      <AnimatedLegendList
        ref={listRef}
        data={props.activities}
        keyExtractor={workLogRowKey}
        estimatedItemSize={props.rowSizing.estimatedRowHeight + WORK_ROW_GAP}
        getFixedItemSize={getFixedItemSize}
        initialScrollIndex={initialScrollIndex}
        // Bootstrap overscan is only 50px. An offset inside expanded detail can
        // otherwise leave its own row unmeasured until after scroll restoration.
        alwaysRender={
          restoringPosition && initialPosition ? { keys: [initialPosition.rowId] } : undefined
        }
        recycleItems={false}
        extraData={props.renderRow}
        renderItem={renderItem}
        sharedValues={sharedValues}
        onContentSizeChange={onContentSizeChange}
        onLayout={finishPendingAppend}
        onLoad={() => {
          loadedRef.current = true;
          setRestoringPosition(false);
          rememberPosition();
        }}
        onScroll={rememberPosition}
        onScrollBeginDrag={() => {
          userScrollingRef.current = true;
          pendingAppendHeightRef.current = null;
        }}
        onScrollEndDrag={() => {
          userScrollingRef.current = false;
        }}
        onMomentumScrollBegin={() => {
          userScrollingRef.current = true;
          pendingAppendHeightRef.current = null;
        }}
        onMomentumScrollEnd={() => {
          userScrollingRef.current = false;
          rememberPosition();
        }}
        maintainVisibleContentPosition
        nestedScrollEnabled
        directionalLockEnabled
        showsVerticalScrollIndicator
        scrollsToTop={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        style={StyleSheet.absoluteFill}
      />
    </MaskedView>
  );
}

function workLogRowKey(row: ThreadFeedActivity): string {
  return row.id;
}

const ThreadWorkLogRow = memo(function ThreadWorkLogRow(
  props: Omit<
    ThreadWorkLogProps,
    "activities" | "copiedRowId" | "expandedRows" | "rowSizing" | "scrollPositions"
  > & {
    readonly row: ThreadFeedActivity;
    readonly copied: boolean;
    readonly expanded: boolean;
  },
) {
  const { row, expanded } = props;
  const canExpand = row.canExpand;
  const fullDetail = expanded ? row.getFullDetail() : null;
  const viewedImagePath = workEntryViewedImagePath(row.workEntry);
  const toolPresentation = resolveWorkEntryToolPresentation(row.workEntry);
  const previewText =
    toolPresentation?.displayName ?? compactActivityDetail(row.detail) ?? row.summary;
  const displayText =
    !toolPresentation && expanded && row.workEntry.command?.trim() ? "Command" : previewText;
  const iconIsDestructive = row.icon === "alert" || row.icon === "warning";
  const failed = row.status === "failure";
  const icon = toolPresentation?.icon ?? (failed ? "xmark" : workRowSymbolName(row.icon));

  return (
    <Animated.View
      layout={WORK_LOG_LAYOUT_TRANSITION}
      className="overflow-hidden"
      {...(isFreshRow(row.createdAt) ? { entering: FadeIn.duration(200) } : {})}
    >
      <Pressable
        accessibilityRole={canExpand ? "button" : undefined}
        accessibilityLabel={failed ? `${previewText}, tool call failed` : previewText}
        accessibilityHint={
          canExpand ? "Double tap to show full details. Long press to copy." : "Long press to copy."
        }
        accessibilityState={canExpand ? { expanded } : undefined}
        hitSlop={4}
        onPress={() => {
          if (canExpand) {
            void Haptics.selectionAsync();
            props.onToggleRow(row.id, props.anchorKey);
          }
        }}
        onLongPress={() => props.onCopyRow(row.id, row.getCopyText())}
        className="rounded-md px-0.5 py-0 active:bg-subtle"
      >
        <View className="min-h-8 flex-row items-center gap-1.5">
          {row.live ? (
            <ShimmeringWorkContent
              icon={icon}
              iconSubtleColor={props.iconSubtleColor}
              label={displayText}
              showIcon
            />
          ) : (
            <>
              <View className="h-6 w-6 shrink-0 items-center justify-center">
                <WorkLogIcon
                  icon={icon}
                  color={iconIsDestructive ? "#e11d48" : props.iconSubtleColor}
                />
              </View>
              <Text
                className={cn(
                  "min-w-0 flex-1 text-sm text-foreground-muted",
                  iconIsDestructive && "font-t3-medium text-adaptive-rose-600-400",
                )}
                numberOfLines={1}
              >
                {displayText}
              </Text>
            </>
          )}

          <View className="shrink-0 flex-row items-center gap-px">
            {props.copied ? (
              <Text className="pr-1 font-t3-medium text-3xs text-adaptive-emerald-600-400">
                Copied
              </Text>
            ) : null}
            {failed && toolPresentation ? (
              <View
                className="h-4 w-4 items-center justify-center"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <SymbolView
                  name="xmark"
                  size={11}
                  tintColorClassName="accent-adaptive-rose-600-400"
                  type="monochrome"
                />
              </View>
            ) : null}
            <View className="h-4 w-4 items-center justify-center">
              {canExpand ? (
                <ThreadDisclosureChevron
                  expanded={expanded}
                  collapsedDirection="down"
                  size={11}
                  tintColor={props.iconSubtleColor}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>

      {fullDetail ? (
        <Animated.View
          entering={WORK_LOG_DETAIL_ENTER_TRANSITION}
          exiting={WORK_LOG_DETAIL_EXIT_TRANSITION}
          layout={WORK_LOG_LAYOUT_TRANSITION}
          className="ml-7 border-l border-adaptive-neutral-300-a60-white-a12 pb-1 pl-3 pt-0.5"
        >
          {viewedImagePath ? (
            <View className="pb-1.5">
              {props.renderImage({ href: viewedImagePath, alt: null, title: null })}
            </View>
          ) : null}
          <ScrollView
            nestedScrollEnabled
            directionalLockEnabled
            showsVerticalScrollIndicator
            className="max-h-60"
            contentContainerStyle={{ paddingRight: 8 }}
          >
            <Text selectable className="font-mono text-2xs leading-normal text-foreground-muted">
              {fullDetail}
            </Text>
          </ScrollView>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

export function ThreadWorkGroupToggle(props: {
  readonly rowSizing: ReturnType<typeof deriveThreadWorkLogSizing>;
  readonly expanded: boolean;
  readonly hiddenCount: number;
  readonly iconSubtleColor: import("react-native").ColorValue;
  readonly onlyToolActivities: boolean;
  readonly onToggle: () => void;
}) {
  const colorScheme = useColorScheme();
  const pressedBackground = colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";
  const noun = props.onlyToolActivities
    ? props.hiddenCount === 1
      ? "tool call"
      : "tool calls"
    : props.hiddenCount === 1
      ? "log entry"
      : "log entries";
  const collapsedLabel = `Show ${props.hiddenCount} previous ${noun}`;
  const expandedLabel = props.onlyToolActivities
    ? "Show fewer tool calls"
    : "Show fewer log entries";

  return (
    <View className="-mx-1 px-1 py-0">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.expanded }}
        accessibilityLabel={props.expanded ? expandedLabel : collapsedLabel}
        hitSlop={4}
        onPress={() => {
          void Haptics.selectionAsync();
          props.onToggle();
        }}
        className="min-h-8 flex-row items-center gap-1.5 rounded-md px-0.5 py-0 active:bg-subtle"
        style={{ minHeight: props.rowSizing.estimatedRowHeight }}
      >
        <View className="h-[18px] w-5 items-center justify-center">
          <SymbolView
            name={
              props.expanded
                ? { ios: "chevron.up", android: "keyboard_arrow_up" }
                : { ios: "chevron.down", android: "keyboard_arrow_down" }
            }
            size={12}
            tintColor={props.iconSubtleColor}
            type="monochrome"
          />
        </View>
        <Text className="font-t3-medium text-xs text-foreground opacity-80">
          {props.expanded ? expandedLabel : `+${props.hiddenCount} previous ${noun}`}
        </Text>
      </Pressable>
    </View>
  );
}
