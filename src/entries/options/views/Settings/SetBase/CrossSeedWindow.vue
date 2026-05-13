<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useConfigStore } from "@/options/stores/config.ts";
import { useMetadataStore } from "@/options/stores/metadata.ts";
import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";

const { t } = useI18n();
const configStore = useConfigStore();
const metadataStore = useMetadataStore();

const availableSites = computed(() => {
  return Object.values(metadataStore.sites)
    .filter((site) => !site.isOffline)
    .map((site) => ({
      title: site.name,
      value: site.id,
    }));
});

const availableDownloaders = computed(() => {
  return Object.values(metadataStore.downloaders).map((d) => ({
    title: d.name || d.id,
    value: d.id,
  }));
});

function addPathMapping() {
  if (!configStore.crossSeedControl.pathMappings) {
    configStore.crossSeedControl.pathMappings = [];
  }
  configStore.crossSeedControl.pathMappings.push({
    fromClient: "",
    toClient: "",
    search: "",
    replace: "",
  });
}

function removePathMapping(index: number) {
  configStore.crossSeedControl.pathMappings.splice(index, 1);
}
</script>

<template>
  <div>
    <v-alert type="info" class="mb-4">
      {{ t("SetBase.CrossSeedWindow.intro") }}
    </v-alert>

    <v-card class="mb-4">
      <v-card-title>{{ t("SetBase.CrossSeedWindow.scheduleTitle") }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="configStore.crossSeedControl.autoScanInterval"
              :items="[
                { title: t('SetBase.CrossSeedWindow.intervalDisabled'), value: 0 },
                { title: t('SetBase.CrossSeedWindow.intervalHours', { hours: 1 }), value: 1 },
                { title: t('SetBase.CrossSeedWindow.intervalHours', { hours: 2 }), value: 2 },
                { title: t('SetBase.CrossSeedWindow.intervalHours', { hours: 4 }), value: 4 },
                { title: t('SetBase.CrossSeedWindow.intervalHours', { hours: 12 }), value: 12 },
                { title: t('SetBase.CrossSeedWindow.intervalHours', { hours: 24 }), value: 24 },
              ]"
              :label="t('SetBase.CrossSeedWindow.autoScanInterval')"
              variant="outlined"
              density="compact"
              hide-details
            ></v-select>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>{{ t("SetBase.CrossSeedWindow.iyuuTitle") }}</v-card-title>
      <v-card-text>
        <p class="text-caption text-grey mb-4">{{ t("SetBase.CrossSeedWindow.iyuuDesc") }}</p>
        <v-text-field
          v-model="configStore.crossSeedControl.iyuuToken"
          :label="t('SetBase.CrossSeedWindow.iyuuToken')"
          variant="outlined"
          density="compact"
          prepend-inner-icon="mdi-key"
          type="password"
          hide-details
        ></v-text-field>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>{{ t("SetBase.CrossSeedWindow.targetSitesTitle") }}</v-card-title>
      <v-card-text>
        <p class="text-caption text-grey mb-4">{{ t("SetBase.CrossSeedWindow.targetSitesDesc") }}</p>
        <v-autocomplete
          v-model="configStore.crossSeedControl.targetSites"
          :items="availableSites"
          :label="t('SetBase.CrossSeedWindow.targetSites')"
          multiple
          chips
          closable-chips
          variant="outlined"
          density="compact"
        >
          <template #chip="{ props, item }">
            <v-chip v-bind="props" size="small" class="ma-1">
              <SiteFavicon :site-id="item.value" :size="16" class="mr-1" />
              {{ item.title }}
            </v-chip>
          </template>
          <template #item="{ props, item }">
            <v-list-item v-bind="props" :title="item.title">
              <template #prepend>
                <SiteFavicon :site-id="item.value" :size="20" class="mr-3" />
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>{{ t("SetBase.CrossSeedWindow.pathMappingTitle") }}</v-card-title>
      <v-card-text>
        <p class="text-caption text-grey mb-4">{{ t("SetBase.CrossSeedWindow.pathMappingDesc") }}</p>

        <v-row
          v-for="(mapping, index) in configStore.crossSeedControl.pathMappings"
          :key="index"
          class="align-center mb-2"
        >
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="mapping.fromClient"
              :items="[{ title: t('common.all'), value: '' }, ...availableDownloaders]"
              :label="t('SetBase.CrossSeedWindow.fromClient')"
              variant="outlined"
              density="compact"
              hide-details
            ></v-select>
          </v-col>
          <v-col cols="12" sm="6" md="2">
            <v-select
              v-model="mapping.toClient"
              :items="[{ title: t('common.all'), value: '' }, ...availableDownloaders]"
              :label="t('SetBase.CrossSeedWindow.toClient')"
              variant="outlined"
              density="compact"
              hide-details
            ></v-select>
          </v-col>
          <v-col cols="12" sm="5" md="3">
            <v-text-field
              v-model="mapping.search"
              :label="t('SetBase.CrossSeedWindow.searchPath')"
              variant="outlined"
              density="compact"
              hide-details
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="5" md="4">
            <v-text-field
              v-model="mapping.replace"
              :label="t('SetBase.CrossSeedWindow.replacePath')"
              variant="outlined"
              density="compact"
              hide-details
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="2" md="1">
            <v-btn
              icon="mdi-delete"
              color="error"
              variant="text"
              size="small"
              @click="removePathMapping(index)"
            ></v-btn>
          </v-col>
        </v-row>

        <v-btn color="primary" variant="outlined" prepend-icon="mdi-plus" class="mt-2" @click="addPathMapping">
          {{ t("SetBase.CrossSeedWindow.addMapping") }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>{{ t("SetBase.CrossSeedWindow.automationTitle") }}</v-card-title>
      <v-card-text>
        <v-switch
          v-model="configStore.crossSeedControl.autoInject"
          color="primary"
          :label="t('SetBase.CrossSeedWindow.autoInject')"
          hide-details
        ></v-switch>
        <p class="text-caption text-grey ml-12">{{ t("SetBase.CrossSeedWindow.autoInjectDesc") }}</p>

        <v-switch
          v-model="configStore.crossSeedControl.safeInjectOnly"
          color="primary"
          :label="t('SetBase.CrossSeedWindow.safeInjectOnly')"
          hide-details
          class="mt-2"
          :disabled="!configStore.crossSeedControl.autoInject"
        ></v-switch>
        <p class="text-caption text-grey ml-12">{{ t("SetBase.CrossSeedWindow.safeInjectOnlyDesc") }}</p>

        <v-switch
          v-model="configStore.crossSeedControl.autoResume"
          color="primary"
          :label="t('SetBase.CrossSeedWindow.autoResume')"
          hide-details
          class="mt-2"
        ></v-switch>
        <p class="text-caption text-grey ml-12">{{ t("SetBase.CrossSeedWindow.autoResumeDesc") }}</p>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped></style>
