<script setup lang="ts">
import { ref, onMounted, computed, provide } from "vue";
import { useI18n } from "vue-i18n";
import { useConfigStore } from "@/options/stores/config.ts";
import { sendMessage } from "@/messages.ts";

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

const echartsTheme = computed(() => (configStore.uiTheme === "dark" ? "dark" : null));
provide(THEME_KEY, echartsTheme);

const loading = ref(true);

const stats = ref({
  totalMetadata: 0,
  duplicateGroups: 0,
  totalTasks: 0,
  totalInjected: 0,
});

type EChartsPieOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | LegendComponentOption | PieSeriesOption
>;
type EChartsBarOption = ComposeOption<
  TitleComponentOption | TooltipComponentOption | GridComponentOption | BarSeriesOption
>;

const taskStatusChartOption = ref<EChartsPieOption>({});
const siteDistributionChartOption = ref<EChartsBarOption>({});

async function loadData() {
  loading.value = true;
  try {
    const allMetadata = (await sendMessage("getAllTorrentMetadata", undefined)) as any[];
    const duplicates = (await sendMessage("analyzeDuplicateTorrents", undefined)) as any[][];
    const queue = (await sendMessage("getReseedQueue", undefined)) as any[];
    const allResults = (await sendMessage("getAllReseedResults", undefined)) as any[];

    stats.value.totalMetadata = allMetadata.length;
    stats.value.duplicateGroups = duplicates.length;
    stats.value.totalTasks = queue.length;
    stats.value.totalInjected = allResults.filter((r) => r.status === "injected").length;

    // Process Task Status
    const statusCounts: Record<string, number> = {};
    queue.forEach((task) => {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    });

    const statusData = Object.entries(statusCounts).map(([key, value]) => ({
      name: t(`CrossSeed.status.${key}`) || key,
      value,
    }));

    taskStatusChartOption.value = {
      title: { text: t("CrossSeed.stats.taskStatus"), left: "center" },
      tooltip: { trigger: "item" },
      legend: { orient: "vertical", left: "left" },
      series: [
        {
          type: "pie",
          radius: "50%",
          data: statusData,
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.5)" },
          },
        },
      ],
    };

    // Process Site Distribution (from results)
    const siteCounts: Record<string, number> = {};
    allResults.forEach((res) => {
      siteCounts[res.siteId] = (siteCounts[res.siteId] || 0) + 1;
    });

    const sortedSites = Object.entries(siteCounts).sort((a, b) => b[1] - a[1]);
    const siteNames = sortedSites.map((s) => s[0]);
    const siteValues = sortedSites.map((s) => s[1]);

    siteDistributionChartOption.value = {
      title: { text: t("CrossSeed.stats.siteDistribution"), left: "center" },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
      xAxis: { type: "category", data: siteNames, axisLabel: { interval: 0, rotate: 30 } },
      yAxis: { type: "value" },
      series: [
        {
          name: t("CrossSeed.stats.matchCount"),
          type: "bar",
          data: siteValues,
          itemStyle: { color: "#4CAF50" },
        },
      ],
    };
  } catch (e) {
    console.error("Failed to load statistics", e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <v-card variant="flat" :loading="loading">
    <v-card-text>
      <v-row class="mb-6">
        <v-col cols="6" sm="3">
          <v-card color="blue-lighten-5" variant="flat" class="text-center pa-4">
            <div class="text-caption text-blue-darken-2 font-weight-bold">{{ t("CrossSeed.stats.totalMetadata") }}</div>
            <div class="text-h4 text-blue-darken-4 mt-2">{{ stats.totalMetadata }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card color="orange-lighten-5" variant="flat" class="text-center pa-4">
            <div class="text-caption text-orange-darken-2 font-weight-bold">
              {{ t("CrossSeed.stats.duplicateGroups") }}
            </div>
            <div class="text-h4 text-orange-darken-4 mt-2">{{ stats.duplicateGroups }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card color="purple-lighten-5" variant="flat" class="text-center pa-4">
            <div class="text-caption text-purple-darken-2 font-weight-bold">{{ t("CrossSeed.stats.totalTasks") }}</div>
            <div class="text-h4 text-purple-darken-4 mt-2">{{ stats.totalTasks }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card color="green-lighten-5" variant="flat" class="text-center pa-4">
            <div class="text-caption text-green-darken-2 font-weight-bold">
              {{ t("CrossSeed.stats.totalInjected") }}
            </div>
            <div class="text-h4 text-green-darken-4 mt-2">{{ stats.totalInjected }}</div>
          </v-card>
        </v-col>
      </v-row>

      <v-row>
        <v-col cols="12" md="5">
          <v-card variant="outlined" class="pa-4 h-100">
            <v-chart :option="taskStatusChartOption" autoresize style="height: 300px" />
          </v-card>
        </v-col>
        <v-col cols="12" md="7">
          <v-card variant="outlined" class="pa-4 h-100">
            <v-chart :option="siteDistributionChartOption" autoresize style="height: 300px" />
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<style scoped></style>
