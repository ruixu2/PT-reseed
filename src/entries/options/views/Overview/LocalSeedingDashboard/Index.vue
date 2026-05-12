<script setup lang="ts">
import { ref, onMounted, computed, provide } from "vue";
import { useI18n } from "vue-i18n";
import { sendMessage } from "@/messages.ts";
import { formatSize, formatDate } from "@/options/utils.ts";
import { useConfigStore } from "@/options/stores/config.ts";
import { useMetadataStore } from "@/options/stores/metadata.ts";
import { getHostFromUrl } from "@ptd/site";
import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";

import VChart, { THEME_KEY } from "vue-echarts";
import { use as useEcharts, type ComposeOption } from "echarts/core";
import { PieChart, BarChart, type PieSeriesOption, type BarSeriesOption } from "echarts/charts";
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

useEcharts([TitleComponent, TooltipComponent, LegendComponent, GridComponent, PieChart, BarChart, CanvasRenderer]);

const { t } = useI18n();
const configStore = useConfigStore();
const metadataStore = useMetadataStore();

const echartsTheme = computed(() => (configStore.uiTheme === "dark" ? "dark" : null));
provide(THEME_KEY, echartsTheme);

const loading = ref(true);

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

type EChartsPieOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | LegendComponentOption | PieSeriesOption
>;
type EChartsBarOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | GridComponentOption | BarSeriesOption
>;

const clientDistributionChartOption = ref<EChartsPieOption>({});
const siteDistributionChartOption = ref<EChartsBarOption>({});

const stateChipColor: Record<string, string> = {
  seeding: "success",
  paused: "warning",
  error: "error",
  checking: "info",
  queued: "grey",
  downloading: "primary",
  unknown: "grey",
};

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
  } catch (e) {
    console.error("Dashboard Load Error", e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboardData);
</script>

<template>
  <v-container fluid>
    <v-card variant="flat" :loading="loading">
      <v-card-title class="d-flex align-center">
        {{ t("route.Overview.LocalSeedingDashboard") }}
        <v-spacer></v-spacer>
        <v-btn icon="mdi-refresh" variant="text" size="small" @click="loadDashboardData"></v-btn>
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
              <div class="d-flex align-center text-truncate" style="max-width: 500px">
                <span class="text-body-2 font-weight-medium text-truncate">{{ item.name }}</span>
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
  </v-container>
</template>

<style scoped></style>
