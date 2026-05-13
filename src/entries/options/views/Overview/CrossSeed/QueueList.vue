<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { sendMessage } from "@/messages.ts";
import { formatDate } from "@/options/utils.ts";
import type { IReseedTask } from "@/shared/types.ts";

import SearchResultDialog from "./SearchResultDialog.vue";

const { t } = useI18n();
const queue = ref<IReseedTask[]>([]);
const loading = ref(false);
const timer = ref<any>(null);

const searchQuery = ref("");
const filterStatus = ref<string[]>([]);

const showResults = ref(false);
const results = ref<any[]>([]);
const currentTask = ref<any>(null);

const statusOptions = ["waiting", "searching", "matched", "no_match", "error", "completed"];

const filteredQueue = computed(() => {
  return queue.value.filter((item) => {
    if (searchQuery.value && !item.name.toLowerCase().includes(searchQuery.value.toLowerCase())) return false;
    if (filterStatus.value.length > 0 && !filterStatus.value.includes(item.status)) return false;
    return true;
  });
});

const headers = [
  { title: t("common.name"), key: "name", align: "start" as const },
  { title: t("common.status"), key: "status", align: "center" as const },
  { title: t("CrossSeed.table.progress"), key: "progress", align: "center" as const },
  { title: t("common.date"), key: "addedAt", align: "end" as const },
  { title: t("common.action"), key: "action", align: "center" as const, sortable: false },
];

async function loadQueue() {
  queue.value = (await sendMessage("getReseedQueue", undefined)) as IReseedTask[];
}

async function startRunner() {
  await sendMessage("startReseedRunner", undefined);
  await loadQueue();
}

async function reviewResults(task: IReseedTask) {
  loading.value = true;
  try {
    const rawResults = (await sendMessage("getReseedResults", task.infoHash)) as any[];
    results.value = rawResults.map((r) => r.data);
    currentTask.value = {
      name: task.name,
      infoHash: task.infoHash,
      clientId: task.clientId,
      savePath: task.savePath,
    };
    showResults.value = true;
  } finally {
    loading.value = false;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "matched":
      return "success";
    case "searching":
      return "info";
    case "waiting":
      return "grey";
    case "error":
      return "error";
    case "no_match":
      return "orange";
    default:
      return "grey";
  }
}

onMounted(() => {
  loadQueue();
  timer.value = setInterval(loadQueue, 3000);
});

onUnmounted(() => {
  if (timer.value) clearInterval(timer.value);
});
</script>

<template>
  <v-card variant="flat">
    <v-card-title class="d-flex align-center py-2 px-0">
      <span class="text-h6">{{ t("CrossSeed.queueTitle") }}</span>
      <v-spacer></v-spacer>
      <v-btn color="primary" size="small" variant="elevated" prepend-icon="mdi-play" @click="startRunner">
        {{ t("CrossSeed.startRunner") }}
      </v-btn>
    </v-card-title>

    <v-card-text class="pt-0 pb-2">
      <v-row dense align="center">
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="searchQuery"
            :label="t('common.search')"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            clearable
          />
        </v-col>
        <v-col cols="6" sm="3" md="3">
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            :item-title="(s) => t(`CrossSeed.status.${s}`)"
            :label="t('common.status')"
            density="compact"
            variant="outlined"
            hide-details
            multiple
            clearable
            chips
            max-visible-chips="1"
          />
        </v-col>
        <v-col cols="6" sm="3" md="auto" class="d-flex align-center">
          <span class="text-caption text-grey">
            {{ filteredQueue.length }} / {{ queue.length }} {{ t("common.items") }}
          </span>
        </v-col>
      </v-row>
    </v-card-text>

    <v-data-table
      :headers="headers"
      :items="filteredQueue"
      :loading="loading"
      density="compact"
      class="elevation-1"
      item-value="infoHash"
    >
      <template #item.status="{ item }">
        <v-chip :color="getStatusColor(item.status)" size="x-small" label>
          {{ t(`CrossSeed.status.${item.status}`) }}
        </v-chip>
      </template>

      <template #item.progress="{ item }">
        <div v-if="item.progress != null" class="d-flex align-center" style="min-width: 100px">
          <v-progress-linear
            :model-value="item.progress"
            :color="getStatusColor(item.status)"
            height="6"
            rounded
            class="mr-2"
          ></v-progress-linear>
          <span class="text-caption">{{ item.progress }}%</span>
        </div>
        <span v-else class="text-caption text-grey">-</span>
      </template>

      <template #item.addedAt="{ item }">
        <span class="text-caption">{{ formatDate(item.addedAt, "yyyy-MM-dd HH:mm") }}</span>
      </template>

      <template #item.action="{ item }">
        <v-btn
          v-if="item.status === 'matched'"
          size="x-small"
          variant="text"
          color="success"
          icon="mdi-eye"
          :title="t('common.view')"
          @click="reviewResults(item)"
        ></v-btn>
      </template>

      <template #no-data>
        <div class="pa-4 text-center text-grey">
          {{ t("CrossSeed.noQueueItems") }}
        </div>
      </template>
    </v-data-table>

    <SearchResultDialog v-model="showResults" :results="results" :source-torrent="currentTask" />
  </v-card>
</template>
