<script setup lang="ts">
import { ref, onMounted, computed, provide } from "vue";
import { useI18n } from "vue-i18n";
import { sendMessage } from "@/messages.ts";
import { formatSize } from "@/options/utils.ts";
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

const topHugeSeeds = ref<any[]>([]);

type EChartsPieOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | LegendComponentOption | PieSeriesOption
>;
type EChartsBarOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | GridComponentOption | BarSeriesOption
>;

const clientDistributionChartOption = ref<EChartsPieOption>({});
const siteDistributionChartOption = ref<EChartsBarOption>({});

async function loadDashboardData() {
  loading.value = true;
  try {
    const downloaders = Object.values(metadataStore.downloaders).filter((d) => d.enabled);
    let allTorrents: any[] = [];

    // 1. 并行拉取所有下载器的种子
    const fetchPromises = downloaders.map(async (d) => {
      try {
        const torrents = await sendMessage("getDownloaderTorrents", d.id);
        // 给每个种子打上归属客户端标签
        return torrents.map((t) => ({ ...t, clientName: d.name || d.id }));
      } catch (e) {
        console.error(`Failed to fetch from ${d.name}`, e);
        return [];
      }
    });

    const resultsArray = await Promise.all(fetchPromises);
    allTorrents = resultsArray.flat();

    // 只统计已经完成的种子（做种中或已完成暂停）
    const seedingTorrents = allTorrents.filter((t) => t.isCompleted);

    // 2. 物理去重计算总大小（按保存路径去重，避免辅种种子重复计体积）
    const uniquePathTokens = new Map<string, any>();
    let totalRealSize = 0;
    let totalUploaded = 0;
    let errorCount = 0;
    let ptCount = 0;
    let btCount = 0;

    // 客户端分布统计
    const clientCounts: Record<string, number> = {};
    // 站点分布统计
    const siteCounts: Record<string, number> = {};
    const siteHostMap = metadataStore.siteHostMap || {};

    seedingTorrents.forEach((t) => {
      // 统计异常状态 (红种)
      if (t.state === "error" || t.state === 5) {
        errorCount++;
      }

      // 客户端分布
      clientCounts[t.clientName] = (clientCounts[t.clientName] || 0) + 1;

      // 站点分布解析 & PT/BT 分类
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

      // 给种子打上解析出的站点标签，供 topHugeSeeds 展示
      t._site = originSite;

      // 总上传量累加（包含重复做种的贡献）
      totalUploaded += t.totalUploaded || 0;

      // 按保存路径去重：辅种种子（不同 infoHash 同路径）不重复统计体积
      if (t.savePath && !uniquePathTokens.has(t.savePath)) {
        uniquePathTokens.set(t.savePath, t);
        totalRealSize += t.totalSize || 0;
      } else if (!t.savePath && t.infoHash && !uniquePathTokens.has(t.infoHash)) {
        uniquePathTokens.set(t.infoHash, t);
        totalRealSize += t.totalSize || 0;
      }
    });

    const uniqueSeedsList = Array.from(uniquePathTokens.values());

    stats.value = {
      totalSeeds: seedingTorrents.length,
      ptSeeds: ptCount,
      btSeeds: btCount,
      totalSize: totalRealSize,
      totalUploaded: totalUploaded,
      averageRatio: totalRealSize > 0 ? totalUploaded / totalRealSize : 0,
      errorSeeds: errorCount,
    };

    // 提取体积最大的 Top 10（带站点标签）
    topHugeSeeds.value = uniqueSeedsList
      .sort((a, b) => (b.totalSize || 0) - (a.totalSize || 0))
      .slice(0, 10)
      .map((t) => ({
        ...t,
        sites: t._site && t._site !== "Uncateg" ? [t._site] : [],
      }));

    // --- 图表渲染 ---

    // 客户端分布饼图
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

    // 站点分布柱状图 (排除 Unknown 如果太多，这里为了全貌先保留，只取 Top 15)
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

        <v-row v-if="stats.totalSeeds > 0" class="mb-6">
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

        <template v-if="stats.totalSeeds > 0">
          <v-row>
            <v-col cols="12" md="4">
              <v-card variant="outlined" class="pa-4 h-100">
                <v-chart :option="clientDistributionChartOption" autoresize style="height: 350px" />
              </v-card>
            </v-col>
            <v-col cols="12" md="8">
              <v-card variant="outlined" class="pa-4 h-100">
                <v-chart :option="siteDistributionChartOption" autoresize style="height: 350px" />
              </v-card>
            </v-col>
          </v-row>

          <v-card variant="outlined" class="mt-6">
            <v-card-title class="text-subtitle-1 pb-0">{{ t("LocalSeedingDashboard.topHugeSeeds") }}</v-card-title>
            <v-list density="compact">
              <v-list-item v-for="(item, index) in topHugeSeeds" :key="item.infoHash || index">
                <template #prepend>
                  <v-avatar color="primary" size="24" class="mr-3 text-caption font-weight-bold text-white">{{
                    index + 1
                  }}</v-avatar>
                </template>
                <v-list-item-title class="text-body-2 text-truncate d-flex align-center" style="max-width: 600px">
                  {{ item.name }}
                  <div v-if="item.sites && item.sites.length > 0" class="ml-2 d-inline-flex">
                    <SiteFavicon
                      v-for="site in item.sites"
                      :key="site"
                      :site-id="site"
                      :size="16"
                      class="ml-1"
                      :title="site"
                    />
                  </div>
                </v-list-item-title>
                <template #append>
                  <v-chip size="x-small" color="secondary" variant="flat">{{ formatSize(item.totalSize) }}</v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </template>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped></style>
