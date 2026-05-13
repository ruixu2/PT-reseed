<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, provide } from "vue";
import { useI18n } from "vue-i18n";
import { sendMessage } from "@/messages.ts";
import { formatSize, formatDate } from "@/options/utils.ts";
import { useConfigStore } from "@/options/stores/config.ts";
import { useMetadataStore } from "@/options/stores/metadata.ts";
import { getHostFromUrl } from "@ptd/site";
import type { ISeedingTrendSnapshot } from "@/storage.ts";
import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";

import VChart, { THEME_KEY } from "vue-echarts";
import { use as useEcharts, type ComposeOption } from "echarts/core";
import {
  PieChart,
  BarChart,
  LineChart,
  type PieSeriesOption,
  type BarSeriesOption,
  type LineSeriesOption,
} from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  type TitleComponentOption,
  type TooltipComponentOption,
  type LegendComponentOption,
  type GridComponentOption,
} from "echarts/components";

useEcharts([
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  PieChart,
  BarChart,
  LineChart,
  CanvasRenderer,
]);

const { t } = useI18n();
const configStore = useConfigStore();
const metadataStore = useMetadataStore();

const echartsTheme = computed(() => (configStore.uiTheme === "dark" ? "dark" : null));
provide(THEME_KEY, echartsTheme);

const loading = ref(true);
const refreshing = ref(false);

const stats = ref({
  totalSeeds: 0,
  ptSeeds: 0,
  btSeeds: 0,
  totalSize: 0,
  totalUploaded: 0,
  averageRatio: 0,
  errorSeeds: 0,
});

const allTorrents = ref<any[]>([]);

// --- Auto Refresh ---
const refreshInterval = ref(0);
const lastRefreshAt = ref<number>(0);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function startRefresh() {
  stopRefresh();
  if (refreshInterval.value > 0) {
    refreshTimer = setInterval(() => {
      loadDashboardData();
    }, refreshInterval.value * 1000);
  }
}

function stopRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

onUnmounted(() => {
  stopRefresh();
});

function onRefreshIntervalChange(val: number) {
  refreshInterval.value = val;
  startRefresh();
}

function formatLastRefresh() {
  if (!lastRefreshAt.value) return "";
  const now = Date.now();
  const diff = Math.floor((now - lastRefreshAt.value) / 1000);
  if (diff < 60) return t("LocalSeedingDashboard.refresh.justNow");
  return t("LocalSeedingDashboard.refresh.ago", { seconds: diff });
}

// --- Trend Chart ---
const trendSnapshots = ref<ISeedingTrendSnapshot[]>([]);
const trendChartLoading = ref(false);

type EChartsLineOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | LegendComponentOption | GridComponentOption | LineSeriesOption
>;

const trendChartOption = ref<EChartsLineOption>({});

async function loadTrendData() {
  try {
    trendSnapshots.value = ((await sendMessage("getExtStorage", "seedingTrend")) as ISeedingTrendSnapshot[]) || [];
  } catch (e) {
    trendSnapshots.value = [];
  }
}

async function saveTrendSnapshot() {
  const now = Date.now();
  const snapshot: ISeedingTrendSnapshot = {
    timestamp: now,
    totalSeeds: stats.value.totalSeeds,
    ptSeeds: stats.value.ptSeeds,
    btSeeds: stats.value.btSeeds,
    totalSize: stats.value.totalSize,
    totalUploaded: stats.value.totalUploaded,
  };

  const existing = trendSnapshots.value.filter((s) => now - s.timestamp < 86400000 * 7);
  existing.push(snapshot);

  if (existing.length > 500) {
    existing.splice(0, existing.length - 500);
  }

  trendSnapshots.value = existing;
  try {
    await sendMessage("setExtStorage", { key: "seedingTrend", value: existing });
  } catch (e) {
    console.error("Failed to save trend snapshot", e);
  }
}

function buildTrendChart() {
  if (trendSnapshots.value.length < 2) return;
  const data = trendSnapshots.value;

  const times = data.map((s) => formatDate(s.timestamp, "MM-dd HH:mm"));
  const seedCounts = data.map((s) => s.totalSeeds);
  const sizeValues = data.map((s) => s.totalSize);
  const ptCounts = data.map((s) => s.ptSeeds);
  const btCounts = data.map((s) => s.btSeeds);

  trendChartOption.value = {
    title: { text: t("LocalSeedingDashboard.trend.title"), left: "center" },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    legend: { bottom: 0, type: "scroll" },
    grid: { left: "3%", right: "4%", bottom: "22%", containLabel: true },
    xAxis: { type: "category", data: times, axisLabel: { interval: "auto", rotate: 30, fontSize: 10 } },
    yAxis: [
      { type: "value", name: t("LocalSeedingDashboard.trend.seedCount"), position: "left" },
      {
        type: "value",
        name: t("LocalSeedingDashboard.trend.size"),
        position: "right",
        axisLabel: { formatter: (v: number) => `${formatSize(v)}` },
      },
    ],
    series: [
      {
        name: t("LocalSeedingDashboard.trend.totalSeeds"),
        type: "line",
        data: seedCounts,
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: "#5C6BC0" },
        emphasis: { focus: "series" },
      },
      {
        name: t("LocalSeedingDashboard.trend.ptSeeds"),
        type: "line",
        data: ptCounts,
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: "#42A5F5" },
        emphasis: { focus: "series" },
      },
      {
        name: t("LocalSeedingDashboard.trend.btSeeds"),
        type: "line",
        data: btCounts,
        smooth: true,
        yAxisIndex: 0,
        itemStyle: { color: "#26A69A" },
        emphasis: { focus: "series" },
      },
      {
        name: t("LocalSeedingDashboard.trend.totalSize"),
        type: "line",
        data: sizeValues,
        smooth: true,
        yAxisIndex: 1,
        itemStyle: { color: "#EF5350" },
        emphasis: { focus: "series" },
      },
    ],
  };
}

// --- Filter ---
const searchQuery = ref("");
const filterSite = ref<string[]>([]);
const filterClient = ref<string[]>([]);
const filterStatus = ref<string[]>([]);

const siteOptions = computed(() => {
  const sites = new Set(allTorrents.value.map((t) => t._site));
  return Array.from(sites).sort();
});
const clientOptions = computed(() => {
  const clients = new Set(allTorrents.value.map((t) => t.clientName));
  return Array.from(clients).sort();
});
const statusOptions = ["seeding", "paused", "error"];

const filteredTorrents = computed(() => {
  return allTorrents.value.filter((t) => {
    if (searchQuery.value && !t.name.toLowerCase().includes(searchQuery.value.toLowerCase())) return false;
    if (filterSite.value.length > 0 && !filterSite.value.includes(t._site)) return false;
    if (filterClient.value.length > 0 && !filterClient.value.includes(t.clientName)) return false;
    if (filterStatus.value.length > 0 && !filterStatus.value.includes(t.state)) return false;
    return true;
  });
});

const tableHeaders = computed(() => [
  { title: t("LocalSeedingDashboard.table.name"), key: "name", sortable: true, width: "30%" },
  { title: t("LocalSeedingDashboard.table.size"), key: "totalSize", sortable: true, align: "end" as const },
  { title: t("LocalSeedingDashboard.table.uploaded"), key: "totalUploaded", sortable: true, align: "end" as const },
  { title: t("LocalSeedingDashboard.table.ratio"), key: "ratio", sortable: true, align: "end" as const },
  { title: t("LocalSeedingDashboard.table.status"), key: "state", sortable: true, align: "center" as const },
  { title: t("LocalSeedingDashboard.table.site"), key: "_site", sortable: true, align: "center" as const },
  { title: t("LocalSeedingDashboard.table.client"), key: "clientName", sortable: true, align: "center" as const },
  { title: t("LocalSeedingDashboard.table.dateAdded"), key: "dateAdded", sortable: true, align: "center" as const },
]);

// --- Charts ---
type EChartsPieOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | LegendComponentOption | PieSeriesOption
>;
type EChartsBarOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | GridComponentOption | BarSeriesOption
>;

const clientDistributionChartOption = ref<EChartsPieOption>({});
const siteDistributionChartOption = ref<EChartsBarOption>({});

// --- Downloader Health ---
interface IDownloaderHealth {
  id: string;
  name: string;
  online: boolean;
  upSpeed: number;
  dlSpeed: number;
  upData: number;
  dlData: number;
  seedCount: number;
  errorCount: number;
}
const downloaderHealthList = ref<IDownloaderHealth[]>([]);

// --- Label Distribution ---
const labelDistributionChartOption = ref<EChartsBarOption>({});

const labelStats = computed(() => {
  const labelMap: Record<string, { count: number; totalSize: number; totalUploaded: number }> = {};
  allTorrents.value.forEach((t) => {
    const key = t.label || "(none)";
    if (!labelMap[key]) labelMap[key] = { count: 0, totalSize: 0, totalUploaded: 0 };
    labelMap[key].count++;
    labelMap[key].totalSize += t.totalSize || 0;
    labelMap[key].totalUploaded += t.totalUploaded || 0;
  });
  return Object.entries(labelMap)
    .map(([label, data]) => ({ label, ...data }))
    .sort((a, b) => b.count - a.count);
});

const stateChipColor: Record<string, string> = {
  seeding: "success",
  paused: "warning",
  error: "error",
  checking: "info",
  queued: "grey",
  downloading: "primary",
  unknown: "grey",
};

// --- Detail Dialog ---
const detailDialog = ref(false);
const detailTorrent = ref<any>(null);

function showDetail(torrent: any) {
  detailTorrent.value = torrent;
  detailDialog.value = true;
}

function openDownloader(address: string) {
  window.open(address, "_blank");
}

function getDownloaderAddress(clientName: string): string {
  for (const d of Object.values(metadataStore.downloaders)) {
    if ((d.name || d.id) === clientName && d.address) {
      return d.address;
    }
  }
  return "";
}

async function loadDownloaderHealth() {
  const downloaders = Object.values(metadataStore.downloaders).filter((d) => d.enabled);
  const results: IDownloaderHealth[] = [];
  for (const d of downloaders) {
    try {
      const [online, status] = await Promise.all([
        sendMessage("pingDownloader", d.id).catch(() => false),
        sendMessage("getDownloaderStatus", d.id).catch(() => null),
      ]);
      const seedCount = allTorrents.value.filter((t) => t.clientName === (d.name || d.id)).length;
      const errorCount = allTorrents.value.filter(
        (t) => t.clientName === (d.name || d.id) && (t.state === "error" || t.state === 5),
      ).length;
      results.push({
        id: d.id,
        name: d.name || d.id,
        online: !!online,
        upSpeed: status?.upSpeed || 0,
        dlSpeed: status?.dlSpeed || 0,
        upData: status?.upData || 0,
        dlData: status?.dlData || 0,
        seedCount,
        errorCount,
      });
    } catch {
      results.push({
        id: d.id,
        name: d.name || d.id,
        online: false,
        upSpeed: 0,
        dlSpeed: 0,
        upData: 0,
        dlData: 0,
        seedCount: 0,
        errorCount: 0,
      });
    }
  }
  downloaderHealthList.value = results;
}

function buildLabelDistributionChart() {
  if (labelStats.value.length === 0) return;
  const top = labelStats.value.slice(0, 15);
  const colors = [
    "#2196F3",
    "#4CAF50",
    "#FF9800",
    "#E91E63",
    "#9C27B0",
    "#00BCD4",
    "#FF5722",
    "#607D8B",
    "#795548",
    "#3F51B5",
    "#009688",
    "#FFC107",
    "#673AB7",
    "#CDDC39",
    "#F44336",
  ];
  labelDistributionChartOption.value = {
    title: { text: t("LocalSeedingDashboard.labelDist"), left: "center" },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "category", data: top.map((s) => s.label), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: "value" },
    series: [
      {
        name: t("LocalSeedingDashboard.seedCount"),
        type: "bar",
        data: top.map((s) => s.count),
        itemStyle: { color: (params: any) => colors[params.dataIndex % colors.length] },
        label: { show: true, position: "top" },
      },
    ],
  };
}

// --- Main Data ---
async function loadDashboardData() {
  loading.value = true;
  try {
    const downloaders = Object.values(metadataStore.downloaders).filter((d) => d.enabled);
    let allTorrentsRaw: any[] = [];

    const fetchPromises = downloaders.map(async (d) => {
      try {
        const torrents: any[] = await sendMessage("getDownloaderTorrents", d.id);
        return torrents.map((t: any) => ({ ...t, clientName: d.name || d.id }));
      } catch (e) {
        console.error(`Failed to fetch from ${d.name}`, e);
        return [];
      }
    });

    const resultsArray = await Promise.all(fetchPromises);
    allTorrentsRaw = resultsArray.flat();

    const seedingTorrents = allTorrentsRaw.filter((t) => t.isCompleted);

    const uniquePathTokens = new Map<string, any>();
    let totalRealSize = 0;
    let totalUploaded = 0;
    let errorCount = 0;
    let ptCount = 0;
    let btCount = 0;

    const clientCounts: Record<string, number> = {};
    const siteCounts: Record<string, number> = {};
    const siteHostMap = metadataStore.siteHostMap || {};

    const enrichedSeeds: any[] = [];

    seedingTorrents.forEach((t) => {
      if (t.state === "error" || t.state === 5) {
        errorCount++;
      }

      clientCounts[t.clientName] = (clientCounts[t.clientName] || 0) + 1;

      let originSite = "Uncateg";
      let isPT = false;
      if (t.trackers && t.trackers.length > 0) {
        for (const trackerUrl of t.trackers) {
          const host = getHostFromUrl(trackerUrl);
          if (siteHostMap[host]) {
            originSite = siteHostMap[host];
            isPT = true;
            break;
          }
        }
      }
      siteCounts[originSite] = (siteCounts[originSite] || 0) + 1;
      if (isPT) {
        ptCount++;
      } else {
        btCount++;
      }

      t._site = originSite;
      t._isPT = isPT;

      totalUploaded += t.totalUploaded || 0;

      if (t.savePath && !uniquePathTokens.has(t.savePath)) {
        uniquePathTokens.set(t.savePath, t);
        totalRealSize += t.totalSize || 0;
      } else if (!t.savePath && t.infoHash && !uniquePathTokens.has(t.infoHash)) {
        uniquePathTokens.set(t.infoHash, t);
        totalRealSize += t.totalSize || 0;
      }

      enrichedSeeds.push(t);
    });

    allTorrents.value = enrichedSeeds;

    stats.value = {
      totalSeeds: seedingTorrents.length,
      ptSeeds: ptCount,
      btSeeds: btCount,
      totalSize: totalRealSize,
      totalUploaded: totalUploaded,
      averageRatio: totalRealSize > 0 ? totalUploaded / totalRealSize : 0,
      errorSeeds: errorCount,
    };

    clientDistributionChartOption.value = {
      title: { text: t("LocalSeedingDashboard.clientDist"), left: "center" },
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { orient: "vertical", left: "left" },
      series: [
        {
          type: "pie",
          radius: "55%",
          data: Object.entries(clientCounts).map(([name, value]) => ({ name, value })),
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.5)" },
          },
        },
      ],
    };

    const sortedSites = Object.entries(siteCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    siteDistributionChartOption.value = {
      title: { text: t("LocalSeedingDashboard.siteDist"), left: "center" },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
      xAxis: { type: "category", data: sortedSites.map((s) => s[0]), axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: "value" },
      series: [
        {
          name: t("LocalSeedingDashboard.seedCount"),
          type: "bar",
          data: sortedSites.map((s) => s[1]),
          itemStyle: { color: "#2196F3" },
          label: { show: true, position: "top" },
        },
      ],
    };

    await loadDownloaderHealth();
    buildLabelDistributionChart();
    await saveTrendSnapshot();
    buildTrendChart();
    lastRefreshAt.value = Date.now();
  } catch (e) {
    console.error("Dashboard Load Error", e);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

onMounted(async () => {
  await loadTrendData();
  await loadDashboardData();
});
</script>

<template>
  <v-container fluid>
    <v-card variant="flat" :loading="loading">
      <v-card-title class="d-flex align-center">
        {{ t("route.Overview.LocalSeedingDashboard") }}
        <v-spacer></v-spacer>
        <v-chip v-if="lastRefreshAt" size="x-small" variant="text" class="mr-2 text-caption text-grey">
          {{ formatLastRefresh() }}
        </v-chip>
        <v-select
          v-model="refreshInterval"
          :items="[
            { title: t('LocalSeedingDashboard.refresh.off'), value: 0 },
            { title: t('LocalSeedingDashboard.refresh.seconds', { seconds: 10 }), value: 10 },
            { title: t('LocalSeedingDashboard.refresh.seconds', { seconds: 30 }), value: 30 },
            { title: t('LocalSeedingDashboard.refresh.seconds', { seconds: 60 }), value: 60 },
          ]"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          class="mr-2"
          style="width: 100px"
          @update:model-value="onRefreshIntervalChange"
        />
        <v-btn icon="mdi-refresh" variant="text" size="small" :loading="refreshing" @click="loadDashboardData"></v-btn>
      </v-card-title>
      <v-card-text>
        <div v-if="stats.totalSeeds === 0 && !loading" class="text-center pa-8 text-grey">
          <v-icon icon="mdi-inbox-outline" size="64" class="mb-4"></v-icon>
          <div class="text-body-1">{{ t("LocalSeedingDashboard.noData") }}</div>
        </div>

        <template v-if="stats.totalSeeds > 0">
          <v-row class="mb-4">
            <v-col cols="6" sm="4" md="2">
              <v-card color="indigo-lighten-5" variant="flat" class="text-center pa-4 h-100">
                <div class="text-caption text-indigo-darken-2 font-weight-bold">
                  {{ t("LocalSeedingDashboard.totalSeeds") }}
                </div>
                <div class="text-h4 text-indigo-darken-4 mt-2">{{ stats.totalSeeds }}</div>
              </v-card>
            </v-col>
            <v-col cols="6" sm="4" md="2">
              <v-card color="blue-lighten-5" variant="flat" class="text-center pa-4 h-100">
                <div class="text-caption text-blue-darken-2 font-weight-bold">
                  {{ t("LocalSeedingDashboard.ptSeeds") }}
                </div>
                <div class="text-h4 text-blue-darken-4 mt-2">{{ stats.ptSeeds }}</div>
              </v-card>
            </v-col>
            <v-col cols="6" sm="4" md="2">
              <v-card color="light-blue-lighten-5" variant="flat" class="text-center pa-4 h-100">
                <div class="text-caption text-light-blue-darken-2 font-weight-bold">
                  {{ t("LocalSeedingDashboard.btSeeds") }}
                </div>
                <div class="text-h4 text-light-blue-darken-4 mt-2">{{ stats.btSeeds }}</div>
              </v-card>
            </v-col>
            <v-col cols="6" sm="4" md="2">
              <v-card color="cyan-lighten-5" variant="flat" class="text-center pa-4 h-100">
                <div class="text-caption text-cyan-darken-2 font-weight-bold">
                  {{ t("LocalSeedingDashboard.totalSize") }}
                </div>
                <div class="text-h5 text-cyan-darken-4 mt-2">{{ formatSize(stats.totalSize) }}</div>
              </v-card>
            </v-col>
            <v-col cols="6" sm="4" md="2">
              <v-card color="teal-lighten-5" variant="flat" class="text-center pa-4 h-100">
                <div class="text-caption text-teal-darken-2 font-weight-bold">
                  {{ t("LocalSeedingDashboard.totalUploaded") }}
                </div>
                <div class="text-h5 text-teal-darken-4 mt-2">{{ formatSize(stats.totalUploaded) }}</div>
              </v-card>
            </v-col>
            <v-col cols="6" sm="4" md="2">
              <v-card color="green-lighten-5" variant="flat" class="text-center pa-4 h-100">
                <div class="text-caption text-green-darken-2 font-weight-bold">
                  {{ t("LocalSeedingDashboard.averageRatio") }}
                </div>
                <div class="text-h5 text-green-darken-4 mt-2">{{ stats.averageRatio.toFixed(2) }}</div>
              </v-card>
            </v-col>
            <v-col cols="6" sm="4" md="2">
              <v-card
                :color="stats.errorSeeds > 0 ? 'red-lighten-5' : 'grey-lighten-4'"
                variant="flat"
                class="text-center pa-4 h-100"
              >
                <div
                  :class="`text-caption font-weight-bold ${stats.errorSeeds > 0 ? 'text-red-darken-2' : 'text-grey-darken-2'}`"
                >
                  {{ t("LocalSeedingDashboard.errorSeeds") }}
                </div>
                <div :class="`text-h4 mt-2 ${stats.errorSeeds > 0 ? 'text-red-darken-4' : 'text-grey-darken-3'}`">
                  {{ stats.errorSeeds }}
                </div>
              </v-card>
            </v-col>
          </v-row>

          <v-row class="mb-6">
            <v-col cols="12" md="12">
              <v-card variant="outlined" class="pa-4">
                <v-chart :option="trendChartOption" autoresize style="height: 300px" />
              </v-card>
            </v-col>
          </v-row>

          <v-row class="mb-6">
            <v-col cols="12" md="4">
              <v-card variant="outlined" class="pa-4 h-100">
                <v-chart :option="clientDistributionChartOption" autoresize style="height: 300px" />
              </v-card>
            </v-col>
            <v-col cols="12" md="8">
              <v-card variant="outlined" class="pa-4 h-100">
                <v-chart :option="siteDistributionChartOption" autoresize style="height: 300px" />
              </v-card>
            </v-col>
          </v-row>

          <!-- Downloader Health -->
          <v-card variant="outlined" class="mb-4">
            <v-card-title class="text-subtitle-1 pb-0 d-flex align-center">
              <v-icon class="mr-2">mdi-server</v-icon>
              {{ t("LocalSeedingDashboard.health.title") }}
            </v-card-title>
            <v-card-text>
              <v-row>
                <v-col v-for="h in downloaderHealthList" :key="h.id" cols="12" sm="6" md="4" lg="3">
                  <v-card :color="h.online ? 'grey-lighten-4' : 'red-lighten-5'" variant="flat" class="pa-3 h-100">
                    <div class="d-flex align-center mb-2">
                      <v-icon :color="h.online ? 'success' : 'error'" size="small" class="mr-2">
                        {{ h.online ? "mdi-check-circle" : "mdi-alert-circle" }}
                      </v-icon>
                      <span class="text-body-2 font-weight-bold text-truncate">{{ h.name }}</span>
                    </div>
                    <v-row dense>
                      <v-col cols="6" class="text-caption text-grey">{{
                        t("LocalSeedingDashboard.health.seedCount")
                      }}</v-col>
                      <v-col cols="6" class="text-caption text-right">{{ h.seedCount }}</v-col>
                      <v-col cols="6" class="text-caption text-grey">{{
                        t("LocalSeedingDashboard.health.upSpeed")
                      }}</v-col>
                      <v-col cols="6" class="text-caption text-right text-success">{{ formatSize(h.upSpeed) }}/s</v-col>
                      <v-col cols="6" class="text-caption text-grey">{{
                        t("LocalSeedingDashboard.health.dlSpeed")
                      }}</v-col>
                      <v-col cols="6" class="text-caption text-right text-primary">{{ formatSize(h.dlSpeed) }}/s</v-col>
                      <v-col cols="6" class="text-caption text-grey">{{
                        t("LocalSeedingDashboard.health.upData")
                      }}</v-col>
                      <v-col cols="6" class="text-caption text-right">{{ formatSize(h.upData) }}</v-col>
                      <v-col cols="6" class="text-caption text-grey">{{
                        t("LocalSeedingDashboard.health.dlData")
                      }}</v-col>
                      <v-col cols="6" class="text-caption text-right">{{ formatSize(h.dlData) }}</v-col>
                      <v-col cols="6" class="text-caption text-grey">{{
                        t("LocalSeedingDashboard.health.errorCount")
                      }}</v-col>
                      <v-col cols="6" class="text-caption text-right" :class="h.errorCount > 0 ? 'text-error' : ''">{{
                        h.errorCount
                      }}</v-col>
                    </v-row>
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <!-- Label Distribution -->
          <v-card variant="outlined" class="mb-4">
            <v-card-title class="text-subtitle-1 pb-0 d-flex align-center">
              <v-icon class="mr-2">mdi-tag-multiple</v-icon>
              {{ t("LocalSeedingDashboard.labelDist") }}
              <v-spacer></v-spacer>
              <span class="text-caption text-grey font-weight-regular">
                {{ t("LocalSeedingDashboard.labelDistCount", { count: labelStats.length }) }}
              </span>
            </v-card-title>
            <v-card-text>
              <v-row>
                <v-col cols="12" md="7">
                  <v-chart :option="labelDistributionChartOption" autoresize style="height: 280px" />
                </v-col>
                <v-col cols="12" md="5">
                  <v-data-table
                    :headers="[
                      { title: t('LocalSeedingDashboard.table.name'), key: 'label', sortable: true },
                      {
                        title: t('LocalSeedingDashboard.health.seedCount'),
                        key: 'count',
                        sortable: true,
                        align: 'end' as const,
                      },
                      {
                        title: t('LocalSeedingDashboard.table.size'),
                        key: 'totalSize',
                        sortable: true,
                        align: 'end' as const,
                      },
                    ]"
                    :items="labelStats"
                    item-value="label"
                    density="compact"
                    class="elevation-0"
                    hide-default-footer
                    hover
                  >
                    <template #item.totalSize="{ item }">
                      <span class="text-no-wrap text-caption">{{ formatSize(item.totalSize) }}</span>
                    </template>
                  </v-data-table>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-card variant="outlined" class="mb-4">
            <v-card-text class="pb-0">
              <v-row dense align="center">
                <v-col cols="12" sm="6" md="3">
                  <v-text-field
                    v-model="searchQuery"
                    :label="t('LocalSeedingDashboard.filter.search')"
                    prepend-inner-icon="mdi-magnify"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                  />
                </v-col>
                <v-col cols="6" sm="3" md="2">
                  <v-select
                    v-model="filterSite"
                    :items="siteOptions"
                    :label="t('LocalSeedingDashboard.filter.site')"
                    density="compact"
                    variant="outlined"
                    hide-details
                    multiple
                    clearable
                    chips
                    max-visible-chips="0"
                  />
                </v-col>
                <v-col cols="6" sm="3" md="2">
                  <v-select
                    v-model="filterClient"
                    :items="clientOptions"
                    :label="t('LocalSeedingDashboard.filter.client')"
                    density="compact"
                    variant="outlined"
                    hide-details
                    multiple
                    clearable
                    chips
                    max-visible-chips="0"
                  />
                </v-col>
                <v-col cols="6" sm="3" md="2">
                  <v-select
                    v-model="filterStatus"
                    :items="statusOptions"
                    :item-title="(s) => t(`LocalSeedingDashboard.status.${s}`)"
                    :label="t('LocalSeedingDashboard.filter.status')"
                    density="compact"
                    variant="outlined"
                    hide-details
                    multiple
                    clearable
                    chips
                    max-visible-chips="0"
                  />
                </v-col>
                <v-col cols="6" sm="3" md="auto" class="d-flex align-center">
                  <span class="text-caption text-grey">
                    {{ t("LocalSeedingDashboard.filter.matchCount", { count: filteredTorrents.length }) }}
                  </span>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <v-data-table
            :headers="tableHeaders"
            :items="filteredTorrents"
            :items-length="filteredTorrents.length"
            item-value="infoHash"
            density="compact"
            class="elevation-0"
            hover
          >
            <template #item.name="{ item }">
              <div
                class="d-flex align-center text-truncate cursor-pointer text-primary"
                style="max-width: 500px"
                @click="showDetail(item)"
              >
                <span class="text-body-2 font-weight-medium text-truncate text-decoration-underline-dashed">{{
                  item.name
                }}</span>
              </div>
            </template>

            <template #item.totalSize="{ item }">
              <span class="text-no-wrap">{{ formatSize(item.totalSize) }}</span>
            </template>

            <template #item.totalUploaded="{ item }">
              <span class="text-no-wrap">{{ formatSize(item.totalUploaded) }}</span>
            </template>

            <template #item.ratio="{ item }">
              <span :class="item.ratio >= 1 ? 'text-success' : 'text-orange-darken-2'">
                {{ item.ratio.toFixed(3) }}
              </span>
            </template>

            <template #item.state="{ item }">
              <v-chip :color="stateChipColor[item.state] || 'grey'" size="x-small" label variant="flat">
                {{ t(`LocalSeedingDashboard.status.${item.state}`) }}
              </v-chip>
            </template>

            <template #item._site="{ item }">
              <div class="d-flex align-center justify-center">
                <SiteFavicon
                  v-if="item._site && item._site !== 'Uncateg'"
                  :site-id="item._site"
                  :size="16"
                  class="mr-1"
                  :title="item._site"
                />
                <span class="text-caption">{{ item._site }}</span>
              </div>
            </template>

            <template #item.clientName="{ item }">
              <span class="text-caption">{{ item.clientName }}</span>
            </template>

            <template #item.dateAdded="{ item }">
              <span class="text-caption text-no-wrap">{{ formatDate(item.dateAdded * 1000) }}</span>
            </template>

            <template #no-data>
              <div class="pa-4 text-center text-caption text-grey">
                {{ t("LocalSeedingDashboard.table.noMatch") }}
              </div>
            </template>
          </v-data-table>
        </template>
      </v-card-text>
    </v-card>

    <!-- Detail Dialog -->
    <v-dialog v-model="detailDialog" max-width="600">
      <v-card v-if="detailTorrent">
        <v-card-title class="d-flex align-center text-subtitle-1">
          <v-icon class="mr-2">mdi-information-outline</v-icon>
          {{ t("LocalSeedingDashboard.detail.title") }}
          <v-spacer></v-spacer>
          <v-btn icon="mdi-close" variant="text" size="small" @click="detailDialog = false"></v-btn>
        </v-card-title>
        <v-card-text>
          <v-list density="compact" class="pa-0">
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-label</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.name")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2 font-weight-medium">{{
                detailTorrent.name
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-fingerprint</v-icon></template>
              <v-list-item-title class="text-caption text-grey">InfoHash</v-list-item-title>
              <v-list-item-subtitle class="text-caption font-family-mono">{{
                detailTorrent.infoHash
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-harddisk</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.size")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{ formatSize(detailTorrent.totalSize) }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-upload</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.uploaded")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{
                formatSize(detailTorrent.totalUploaded)
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-download</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.detail.downloaded")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{
                formatSize(detailTorrent.totalDownloaded)
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-swap-horizontal</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.ratio")
              }}</v-list-item-title>
              <v-list-item-subtitle>
                <v-chip :color="detailTorrent.ratio >= 1 ? 'success' : 'orange'" size="x-small" label variant="flat">
                  {{ detailTorrent.ratio.toFixed(3) }}
                </v-chip>
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-information</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.status")
              }}</v-list-item-title>
              <v-list-item-subtitle>
                <v-chip :color="stateChipColor[detailTorrent.state] || 'grey'" size="x-small" label variant="flat">
                  {{ t(`LocalSeedingDashboard.status.${detailTorrent.state}`) }}
                </v-chip>
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-web</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.site")
              }}</v-list-item-title>
              <v-list-item-subtitle class="d-flex align-center">
                <SiteFavicon
                  v-if="detailTorrent._site && detailTorrent._site !== 'Uncateg'"
                  :site-id="detailTorrent._site"
                  :size="16"
                  class="mr-1"
                />
                {{ detailTorrent._site }}
              </v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-server</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.client")
              }}</v-list-item-title>
              <v-list-item-subtitle>{{ detailTorrent.clientName }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-folder-open</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.detail.savePath")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption text-truncate">{{
                detailTorrent.savePath
              }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-calendar</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.table.dateAdded")
              }}</v-list-item-title>
              <v-list-item-subtitle>{{ formatDate(detailTorrent.dateAdded * 1000) }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider v-if="detailTorrent.trackers && detailTorrent.trackers.length"></v-divider>
            <v-list-item v-if="detailTorrent.trackers && detailTorrent.trackers.length">
              <template #prepend><v-icon class="mr-3">mdi-link-variant</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("LocalSeedingDashboard.detail.trackers")
              }}</v-list-item-title>
              <v-list-item-subtitle>
                <div v-for="tr in detailTorrent.trackers.slice(0, 5)" :key="tr" class="text-caption text-truncate">
                  {{ tr }}
                </div>
                <div v-if="detailTorrent.trackers.length > 5" class="text-caption text-grey">
                  +{{ detailTorrent.trackers.length - 5 }} more
                </div>
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            color="primary"
            variant="elevated"
            :href="getDownloaderAddress(detailTorrent.clientName)"
            target="_blank"
            rel="noopener noreferrer"
          >
            <v-icon start>mdi-open-in-new</v-icon>
            {{ t("LocalSeedingDashboard.detail.openDownloader") }}
          </v-btn>
          <v-btn variant="text" @click="detailDialog = false">{{ t("common.close") }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
