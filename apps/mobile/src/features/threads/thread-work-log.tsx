import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { type AppSymbolName, SymbolView } from "../../components/AppSymbol";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigation } from "@react-navigation/native";
import { LayoutAnimation, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { T3_CODE_BRAND_MARK_SOURCE } from "../../components/brandAssets";
import { cn } from "../../lib/cn";
import { threadFeedActivityIsVisible, type ThreadFeedActivity } from "../../lib/threadActivity";
import Animated, { FadeIn } from "react-native-reanimated";
import { useV2ItemSupport } from "../../state/v2-item-support";
import { ThreadActivityInspector } from "./ThreadActivityInspector";
import {
  resolveThreadActivityMetadata,
  resolveThreadActivityStatus,
} from "./thread-activity-row-presentation";
import { threadWorkLogOverflowNoun } from "./thread-work-log-labels";

const MAX_VISIBLE_WORK_LOG_ENTRIES = 1;
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

function WorkRowIcon(props: {
  readonly row: ThreadFeedActivity;
  readonly iconSubtleColor: import("react-native").ColorValue;
}) {
  const iconIsDestructive = props.row.icon === "alert" || props.row.icon === "warning";
  if (props.row.logo === "t3-code") {
    return (
      <Image
        source={T3_CODE_BRAND_MARK_SOURCE}
        accessibilityIgnoresInvertColors
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
        }}
      />
    );
  }

  return (
    <SymbolView
      name={workRowSymbolName(props.row.icon)}
      size={14}
      weight="medium"
      tintColor={iconIsDestructive ? "#e11d48" : props.iconSubtleColor}
      type="monochrome"
    />
  );
}

function ThreadActivityThreadRow(props: {
  readonly activity: ThreadFeedActivity;
  readonly environmentId: EnvironmentId;
  readonly iconColor: import("react-native").ColorValue;
}) {
  const row = props.activity.projectedItem;
  const support = useV2ItemSupport({
    environmentId: props.environmentId,
    sourceThreadId: row.sourceThreadId,
    sourceItemId: row.sourceItemId,
  });
  const navigation = useNavigation();
  const item = row.item;
  let targetThreadId: ThreadId | null = null;
  let label = "Open related thread";
  let providerDriver = support.providerSession?.driver ?? null;
  let providerInstanceId = support.providerSession?.providerInstanceId ?? null;
  let model = support.providerSession?.model ?? null;

  if (item.type === "thread_created") {
    targetThreadId = item.targetThreadId;
    label = "Open created thread";
    providerInstanceId = item.targetProviderInstanceId;
    model = item.targetModel;
  } else if (item.type === "subagent") {
    targetThreadId = support.subagent?.childThreadId ?? item.childThreadId;
    label = "Open subagent thread";
    providerDriver = support.subagent?.driver ?? item.driver;
    providerInstanceId = support.subagent?.providerInstanceId ?? item.providerInstanceId;
    model = support.subagent?.model ?? model;
  } else if (item.type === "fork") {
    targetThreadId =
      item.targetThreadId === row.sourceThreadId && item.source.type === "run"
        ? item.source.threadId
        : item.targetThreadId;
    label = targetThreadId === item.targetThreadId ? "Open forked thread" : "Open parent thread";
  }

  const metadata = resolveThreadActivityMetadata({ providerDriver, providerInstanceId, model });
  const status = resolveThreadActivityStatus(item.status);
  const statusDotClassName =
    status.tone === "success"
      ? "bg-emerald-500"
      : status.tone === "danger"
        ? "bg-rose-500"
        : status.tone === "warning"
          ? "bg-amber-500"
          : "bg-sky-500";

  return (
    <View className="mb-2 min-h-11 flex-row items-center gap-2 rounded-xl border border-continuous border-adaptive-neutral-950-a10-white-a10 bg-card px-2.5 py-1.5">
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={status.label}
        className={cn("size-2 shrink-0 rounded-full", statusDotClassName)}
      />

      <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
        <Text className="font-t3-medium text-foreground">{props.activity.summary}</Text>
        {metadata ? <Text className="text-foreground-muted opacity-60"> · {metadata}</Text> : null}
      </Text>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        disabled={targetThreadId === null}
        hitSlop={10}
        onPress={() => {
          if (targetThreadId === null) return;
          void Haptics.selectionAsync();
          navigation.navigate("Thread", {
            environmentId: props.environmentId,
            threadId: targetThreadId,
          });
        }}
        className="h-8 shrink-0 flex-row items-center gap-1 rounded-lg bg-adaptive-neutral-950-a5-white-a5 py-1.5 pl-2.5 pr-1.5 active:bg-adaptive-neutral-950-a10-white-a10 disabled:opacity-40"
      >
        <Text className="font-t3-medium text-sm text-foreground">Open</Text>
        <SymbolView name="arrow.right" size={11} tintColor={props.iconColor} type="monochrome" />
      </Pressable>
    </View>
  );
}

// Entering fades only for rows created moments ago: rows remount whenever the
// list scrolls them back into view, and old rows must not replay an entrance.
const FRESH_ROW_WINDOW_MS = 3_000;
function isFreshRow(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < FRESH_ROW_WINDOW_MS;
}

// Routine neutral tool activity carries no signal worth a row. Prominent
// linked activity stays visible so its live status and thread affordance do.
export function visibleWorkLogActivities(
  activities: ReadonlyArray<ThreadFeedActivity>,
): ReadonlyArray<ThreadFeedActivity> {
  return activities.filter(threadFeedActivityIsVisible);
}

export function ThreadWorkLog(props: {
  readonly activities: ReadonlyArray<ThreadFeedActivity>;
  readonly anchorKey: string;
  readonly copiedRowId: string | null;
  readonly currentThreadId: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly expanded: boolean;
  readonly expandedRows: Readonly<Record<string, boolean>>;
  readonly rowSizing: ReturnType<typeof deriveThreadWorkLogSizing>;
  readonly scrollPositions: Map<string, ThreadWorkGroupScrollPosition>;
  readonly iconSubtleColor: ColorValue;
  readonly onCopyRow: (rowId: string, value: string) => void;
  readonly onToggleGroup: () => void;
  readonly onToggleRow: (rowId: string) => void;
  readonly workspaceRoot?: string | null;
}) {
  const rows = visibleWorkLogActivities(props.activities).map((activity) => ({
    ...activity,
    detail: compactActivityDetail(activity.detail),
  }));

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

  const hasOverflow = rows.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
  const visibleRows =
    hasOverflow && !props.expanded ? rows.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES) : rows;
  const hiddenCount = rows.length - visibleRows.length;
  const onlyToolRows = rows.every((row) => row.toolLike);
  const overflowNoun = threadWorkLogOverflowNoun(onlyToolRows, hiddenCount);

  return (
    <View className="-mx-1 mb-3 px-1 py-0.5">
      {!onlyToolRows ? (
        <Text className="px-0.5 pb-0.5 font-t3-medium text-2xs text-foreground-muted opacity-60">
          work log
        </Text>
      ) : null}

      <View className="gap-px">
        {visibleRows.map((row) => {
          const expanded = props.expandedRows[row.id] ?? false;
          const canExpand = row.canExpand;
          const detail = compactActivityDetail(row.detail);
          const displayText = detail ? `${row.summary} ${detail}` : row.summary;
          const textIsDestructive = row.icon === "alert" || row.icon === "warning";

          if (row.prominent) {
            return (
              <Animated.View
                key={row.id}
                {...(isFreshRow(row.createdAt) ? { entering: FadeIn.duration(200) } : {})}
              >
                <ThreadActivityThreadRow
                  activity={row}
                  environmentId={props.environmentId}
                  iconColor={props.iconSubtleColor}
                />
              </Animated.View>
            );
          }

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
                <View className="min-h-9 flex-row items-center gap-1.5">
                  <View className="h-5 w-5 shrink-0 items-center justify-center">
                    <WorkRowIcon row={row} iconSubtleColor={props.iconSubtleColor} />
                  </View>

                  <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
                    <Text
                      className={cn(
                        "font-t3-medium text-foreground",
                        textIsDestructive && "text-adaptive-rose-600-400",
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

              {expanded && canExpand ? (
                <View className="ml-7 border-l border-adaptive-neutral-300-a60-white-a12 pb-1.5 pl-3 pt-0.5">
                  <ThreadActivityInspector
                    activity={row}
                    currentThreadId={props.currentThreadId}
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

      {hasOverflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: props.expanded }}
          accessibilityLabel={
            props.expanded
              ? `Show fewer ${overflowNoun}`
              : `Show ${hiddenCount} previous ${overflowNoun}`
          }
          hitSlop={4}
          onPress={() => {
            triggerDisclosureFeedback();
            props.onToggleGroup();
          }}
          className="min-h-9 flex-row items-center gap-1.5 rounded-md px-0.5 py-0.5 active:bg-subtle"
        >
          <View className="h-5 w-5 items-center justify-center">
            <SymbolView
              name={props.expanded ? "chevron.up" : "chevron.down"}
              size={13}
              tintColor={props.iconSubtleColor}
              type="monochrome"
            />
          </View>
          <Text className="font-t3-medium text-xs text-foreground opacity-80">
            {props.expanded
              ? `Show fewer ${overflowNoun}`
              : `+${hiddenCount} previous ${overflowNoun}`}
          </Text>
        </Pressable>
      ) : null}
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
  const noun = threadWorkLogOverflowNoun(props.onlyToolActivities, props.hiddenCount);

  return (
    <View className="-mx-1 mb-1 px-1">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.expanded }}
        accessibilityLabel={
          props.expanded ? `Show fewer ${noun}` : `Show ${props.hiddenCount} previous ${noun}`
        }
        hitSlop={4}
        onPress={() => {
          triggerDisclosureFeedback();
          props.onToggle();
        }}
        className="min-h-8 flex-row items-center gap-1.5 rounded-md px-0.5 py-0 active:bg-subtle"
      >
        <View className="h-[18px] w-5 items-center justify-center">
          <SymbolView
            name={props.expanded ? "chevron.up" : "chevron.down"}
            size={12}
            tintColor={props.iconSubtleColor}
            type="monochrome"
          />
        </View>
        <Text className="font-t3-medium text-xs text-foreground opacity-80">
          {props.expanded ? `Show fewer ${noun}` : `+${props.hiddenCount} previous ${noun}`}
        </Text>
      </Pressable>
    </View>
  );
}
