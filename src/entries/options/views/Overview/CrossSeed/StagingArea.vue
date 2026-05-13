<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { sendMessage } from "@/messages.ts";
import { formatSize } from "@/options/utils.ts";
import { useRuntimeStore } from "@/options/stores/runtime.ts";
import { useConfigStore } from "@/options/stores/config.ts";
import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";
import type { IReseedResult, IReseedTask } from "@/shared/types.ts";

const { t } = useI18n();
const runtimeStore = useRuntimeStore();
const configStore = useConfigStore();

const loading = ref(false);
const batchLoading = ref(false);
const batchProgress = ref({ current: 0, total: 0 });
const pendingResults = ref<IReseedResult[]>([]);
const tasksMap = ref<Record<string, IReseedTask>>({});
const downloaders = ref<any[]>([]);
const targetDownloaderId = ref<string | null>(null);
const autoRefresh = ref<any>(null);

const selected = ref<string[]>([]);
const expandedGroups = ref<string[]>([]);

const groupByTask = computed(() => {
  const groups: Record<
    string,
    {
      task: IReseedTask | null;
      results: IReseedResult[];
    }
  > = {};
  for (const r of pendingResults.value) {
    if (!groups[r.sourceInfoHash]) {
      groups[r.sourceInfoHash] = {
        task: tasksMap.value[r.sourceInfoHash] || null,
        results: [],
      };
    }
    groups[r.sourceInfoHash].results.push(r);
  }
  return groups;
});

const groupKeys = computed(() => Object.keys(groupByTask.value));

const totalPending = computed(() => pendingResults.value.length);

const totalGroups = computed(() => groupKeys.value.length);

const resultHeaders = [
  { title: t("CrossSeed.staging.colSite"), key: "site", align: "start" as const, sortable: false },
  { title: t("CrossSeed.staging.colTitle"), key: "title", align: "start" as const, sortable: false },
  { title: t("CrossSeed.staging.colSize"), key: "size", align: "end" as const },
  { title: t("CrossSeed.staging.colMatchLevel"), key: "matchLevel", align: "center" as const },
  { title: t("CrossSeed.staging.colAction"), key: "action", align: "center" as const, sortable: false },
];

async function loadData() {
  loading.value = true;
  try {
    const [results, queue, dl] = await Promise.all([
      sendMessage("getPendingReseedResults", undefined) as Promise<IReseedResult[]>,
      sendMessage("getReseedQueue", undefined) as Promise<IReseedTask[]>,
      sendMessage("getDownloaderList", undefined) as Promise<any[]>,
    ]);
    pendingResults.value = results;
    downloaders.value = dl;

    const map: Record<string, IReseedTask> = {};
    for (const task of queue) {
      map[task.infoHash] = task;
    }
    tasksMap.value = map;

    if (dl.length > 0 && !targetDownloaderId.value) {
      targetDownloaderId.value = dl[0].id;
    }
  } finally {
    loading.value = false;
  }
}

async function approveItem(result: IReseedResult, task: IReseedTask | null) {
  const targetId = targetDownloaderId.value || task?.clientId;
  if (!targetId) return;

  const targetPath = task?.savePath || "";
  try {
    const injectResult: any = await sendMessage("downloadTorrent", {
      torrent: result.data,
      downloaderId: targetId,
      addTorrentOptions: {
        savePath: targetPath,
        addAtPaused: true,
      },
    });

    if (injectResult.success) {
      await sendMessage("markReseedResultStatus", {
        sourceInfoHash: result.sourceInfoHash,
        siteId: result.siteId,
        torrentId: result.torrentId,
        status: "injected",
      });
      runtimeStore.showSnakebar(t("CrossSeed.staging.singleApproved"), { color: "success" });
      pendingResults.value = pendingResults.value.filter((r) => r.id !== result.id);
    } else {
      runtimeStore.showSnakebar(t("CrossSeed.staging.singleApprovedError"), { color: "error" });
    }
  } catch {
    runtimeStore.showSnakebar(t("CrossSeed.staging.singleApprovedError"), { color: "error" });
  }
}

async function ignoreItem(result: IReseedResult) {
  try {
    await sendMessage("markReseedResultStatus", {
      sourceInfoHash: result.sourceInfoHash,
      siteId: result.siteId,
      torrentId: result.torrentId,
      status: "ignored",
    });
    runtimeStore.showSnakebar(t("CrossSeed.staging.singleIgnored"), { color: "info" });
    pendingResults.value = pendingResults.value.filter((r) => r.id !== result.id);
  } catch {
    runtimeStore.showSnakebar(t("CrossSeed.staging.singleIgnoredError"), { color: "error" });
  }
}

async function batchApprove() {
  const items = pendingResults.value.filter((r) => selected.value.includes(r.id) && r.status === "pending");
  if (items.length === 0) return;

  const targetId = targetDownloaderId.value;
  if (!targetId) return;

  batchLoading.value = true;
  batchProgress.value = { current: 0, total: items.length };

  const succeeded: IReseedResult[] = [];
  const failed: IReseedResult[] = [];

  for (const result of items) {
    const task = tasksMap.value[result.sourceInfoHash];
    const targetPath = task?.savePath || "";
    try {
      const injectResult: any = await sendMessage("downloadTorrent", {
        torrent: result.data,
        downloaderId: targetId,
        addTorrentOptions: {
          savePath: targetPath,
          addAtPaused: true,
        },
      });
      if (injectResult.success) {
        succeeded.push(result);
      } else {
        failed.push(result);
      }
    } catch {
      failed.push(result);
    }
    batchProgress.value.current++;
  }

  if (succeeded.length > 0) {
    await sendMessage("batchMarkReseedResultsStatus", {
      items: succeeded.map((r) => ({
        sourceInfoHash: r.sourceInfoHash,
        siteId: r.siteId,
        torrentId: r.torrentId,
      })),
      status: "injected",
    });
    runtimeStore.showSnakebar(t("CrossSeed.staging.batchApproved", { count: succeeded.length }), { color: "success" });
  }

  if (failed.length > 0) {
    runtimeStore.showSnakebar(t("CrossSeed.staging.batchApprovedError"), { color: "error" });
  }

  await loadData();
  selected.value = [];
  batchLoading.value = false;
}

async function approveAll() {
  const allPending = pendingResults.value.filter((r) => r.status === "pending");
  if (allPending.length === 0) return;

  const targetId = targetDownloaderId.value;
  if (!targetId) return;

  batchLoading.value = true;
  batchProgress.value = { current: 0, total: allPending.length };

  const succeeded: IReseedResult[] = [];
  const failed: IReseedResult[] = [];

  for (const result of allPending) {
    const task = tasksMap.value[result.sourceInfoHash];
    const targetPath = task?.savePath || "";
    try {
      const injectResult: any = await sendMessage("downloadTorrent", {
        torrent: result.data,
        downloaderId: targetId,
        addTorrentOptions: {
          savePath: targetPath,
          addAtPaused: true,
        },
      });
      if (injectResult.success) {
        succeeded.push(result);
      } else {
        failed.push(result);
      }
    } catch {
      failed.push(result);
    }
    batchProgress.value.current++;
  }

  if (succeeded.length > 0) {
    await sendMessage("batchMarkReseedResultsStatus", {
      items: succeeded.map((r) => ({
        sourceInfoHash: r.sourceInfoHash,
        siteId: r.siteId,
        torrentId: r.torrentId,
      })),
      status: "injected",
    });
  }

  await loadData();
  selected.value = [];
  batchLoading.value = false;

  if (failed.length === 0) {
    runtimeStore.showSnakebar(t("CrossSeed.staging.batchApproved", { count: succeeded.length }), { color: "success" });
  } else {
    runtimeStore.showSnakebar(
      t("CrossSeed.staging.batchApprovedSome", { succeeded: succeeded.length, failed: failed.length }),
      { color: "warning" },
    );
  }
}

async function batchIgnore() {
  const items = pendingResults.value.filter((r) => selected.value.includes(r.id) && r.status === "pending");
  if (items.length === 0) return;
  batchLoading.value = true;

  try {
    await sendMessage("batchMarkReseedResultsStatus", {
      items: items.map((r) => ({
        sourceInfoHash: r.sourceInfoHash,
        siteId: r.siteId,
        torrentId: r.torrentId,
      })),
      status: "ignored",
    });
    runtimeStore.showSnakebar(t("CrossSeed.staging.batchIgnored", { count: items.length }), { color: "info" });
    await loadData();
    selected.value = [];
  } catch {
    runtimeStore.showSnakebar(t("CrossSeed.staging.batchIgnoredError"), { color: "error" });
  } finally {
    batchLoading.value = false;
  }
}

onMounted(() => {
  loadData();
  autoRefresh.value = setInterval(loadData, 5000);
});

onUnmounted(() => {
  if (autoRefresh.value) clearInterval(autoRefresh.value);
});
</script>

<template>
  <v-card variant="flat">
    <v-card-text>
      <v-alert type="info" class="mb-4" density="compact">
        {{ t("CrossSeed.staging.intro") }}
      </v-alert>

      <v-row class="mb-4">
        <v-col cols="6" sm="3">
          <v-card color="warning-lighten-5" variant="flat" class="text-center pa-3">
            <div class="text-caption text-warning-darken-2 font-weight-bold">{{ t("CrossSeed.staging.title") }}</div>
            <div class="text-h5 text-warning-darken-4 mt-1">{{ totalPending }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card color="blue-lighten-5" variant="flat" class="text-center pa-3">
            <div class="text-caption text-blue-darken-2 font-weight-bold">{{ t("CrossSeed.staging.sourceInfo") }}</div>
            <div class="text-h5 text-blue-darken-4 mt-1">{{ totalGroups }}</div>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6">
          <v-card variant="outlined" class="pa-2 h-100">
            <div class="d-flex align-center flex-wrap ga-1">
              <v-select
                v-model="targetDownloaderId"
                :items="downloaders"
                item-title="name"
                item-value="id"
                :label="t('CrossSeed.staging.targetDownloader')"
                hide-details
                density="compact"
                variant="outlined"
                style="min-width: 160px"
              ></v-select>
              <v-btn
                color="success"
                variant="elevated"
                size="small"
                :disabled="selected.length === 0"
                :loading="batchLoading"
                @click="batchApprove"
              >
                <v-icon start>mdi-check-all</v-icon>
                {{ t("CrossSeed.staging.approveSelected") }}
              </v-btn>
              <v-btn
                color="grey"
                variant="elevated"
                size="small"
                :disabled="selected.length === 0"
                :loading="batchLoading"
                @click="batchIgnore"
              >
                <v-icon start>mdi-close-box-multiple</v-icon>
                {{ t("CrossSeed.staging.ignoreSelected") }}
              </v-btn>
              <v-btn
                color="success"
                variant="tonal"
                size="small"
                :disabled="totalPending === 0"
                :loading="batchLoading"
                @click="approveAll"
              >
                <v-icon start>mdi-fast-forward</v-icon>
                {{ t("CrossSeed.staging.approveAll") }}
              </v-btn>
            </div>
            <v-progress-linear
              v-if="batchLoading && batchProgress.total > 0"
              :model-value="(batchProgress.current / batchProgress.total) * 100"
              color="success"
              height="4"
              rounded
              class="mt-2"
            ></v-progress-linear>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>

    <v-card-text class="pt-0">
      <div v-if="totalPending === 0 && !loading" class="text-center pa-8 text-grey">
        <v-icon icon="mdi-inbox-outline" size="64" class="mb-4"></v-icon>
        <div class="text-body-1">{{ t("CrossSeed.staging.noPendingItems") }}</div>
      </div>

      <template v-for="key in groupKeys" :key="key">
        <v-card variant="outlined" class="mb-3">
          <v-list-item
            :title="groupByTask[key].task?.name || key"
            :subtitle="`${t('CrossSeed.staging.matchedCount')}: ${groupByTask[key].results.length}`"
            @click="
              expandedGroups.includes(key)
                ? expandedGroups.splice(expandedGroups.indexOf(key), 1)
                : expandedGroups.push(key)
            "
          >
            <template #prepend>
              <v-icon>
                {{ expandedGroups.includes(key) ? "mdi-chevron-down" : "mdi-chevron-right" }}
              </v-icon>
            </template>
            <template #append>
              <v-chip v-if="groupByTask[key].task" size="x-small" color="primary" variant="outlined" class="mr-2">
                {{ groupByTask[key].task?.clientId }}
              </v-chip>
              <v-chip size="x-small" color="warning" label>
                {{ groupByTask[key].results.length }}
              </v-chip>
            </template>
          </v-list-item>

          <v-expand-transition>
            <div v-show="expandedGroups.includes(key)">
              <v-divider></v-divider>
              <v-data-table
                :headers="resultHeaders"
                :items="groupByTask[key].results"
                item-value="id"
                v-model="selected"
                show-select
                select-strategy="page"
                density="compact"
                class="elevation-0"
                hide-default-footer
              >
                <template #item.site="{ item }">
                  <div class="d-flex align-center">
                    <SiteFavicon :site-id="item.siteId" :size="18" class="mr-2" />
                    <span class="text-caption font-weight-bold">{{ item.siteId }}</span>
                  </div>
                </template>

                <template #item.title="{ item }">
                  <div class="text-body-2 font-weight-medium text-truncate" style="max-width: 360px">
                    {{ item.title }}
                  </div>
                  <div v-if="item.subTitle" class="text-caption text-grey text-truncate" style="max-width: 360px">
                    {{ item.subTitle }}
                  </div>
                </template>

                <template #item.size="{ item }">
                  <span class="text-no-wrap">{{ formatSize(item.size) }}</span>
                </template>

                <template #item.matchLevel="{ item }">
                  <v-tooltip location="top">
                    <template #activator="{ props }">
                      <v-chip
                        v-bind="props"
                        :color="
                          item.matchLevel === 'L3'
                            ? 'success'
                            : item.matchLevel === 'L2.5'
                              ? 'info'
                              : item.matchLevel === 'L2'
                                ? 'orange'
                                : 'grey'
                        "
                        size="x-small"
                        label
                        variant="flat"
                      >
                        {{ t(`CrossSeed.matchLevel.${item.matchLevel || "L1"}`) }}
                      </v-chip>
                    </template>
                    <div class="text-caption" style="max-width: 200px">
                      {{ t(`CrossSeed.matchLevel.${item.matchLevel || "L1"}_desc`) }}
                    </div>
                  </v-tooltip>
                </template>

                <template #item.action="{ item }">
                  <div class="d-flex ga-1">
                    <v-btn
                      size="x-small"
                      color="success"
                      variant="elevated"
                      :loading="loading"
                      @click="approveItem(item, groupByTask[key].task)"
                    >
                      <v-icon start size="small">mdi-seed-plus</v-icon>
                      {{ t("CrossSeed.quickCrossSeed") }}
                    </v-btn>
                    <v-btn size="x-small" color="grey" variant="text" :loading="loading" @click="ignoreItem(item)">
                      <v-icon size="small">mdi-close</v-icon>
                    </v-btn>
                  </div>
                </template>

                <template #no-data>
                  <div class="pa-2 text-center text-caption text-grey">
                    {{ t("CrossSeed.staging.noResultsForTask") }}
                  </div>
                </template>
              </v-data-table>
            </div>
          </v-expand-transition>
        </v-card>
      </template>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss"></style>
