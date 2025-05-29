document.addEventListener("DOMContentLoaded", () => {
  const providerSelect = document.getElementById("provider");
  const apiUrlInput = document.getElementById("api-url");
  const modelSelect = document.getElementById("model-name");
  const customModelInput = document.getElementById("custom-model-name");
  const saveBtn = document.getElementById("save-btn");
  const backBtn = document.getElementById("back-btn");

  const providerConfigs = {
    openai: {
      models: [
        { name: "gpt-4", url: "https://api.openai.com/v1/chat/completions" },
        {
          name: "gpt-3.5-turbo",
          url: "https://api.openai.com/v1/chat/completions",
        },
      ],
    },
    ollama: {
      models: [
        { name: "llama3", url: "http://localhost:11434/api/chat" },
        { name: "mistral", url: "http://localhost:11434/api/chat" },
        { name: "gemma", url: "http://localhost:11434/api/chat" },
      ],
    },
    localfastapi: {
      models: [
        { name: "mistral", url: "http://localhost:8000/api/chat" },
        { name: "gemma", url: "http://localhost:8000/api/chat" },
        { name: "command-r", url: "http://localhost:8000/api/chat" },
      ],
    },
    anthropic: {
      models: [
        { name: "claude-3-opus", url: "https://api.anthropic.com/v1/messages" },
      ],
    },
    custom: {
      models: [],
    },
  };

  let pendingModelToSelect = null;

  const savedFileSettings = window.settingsAPI?.load?.();
  const savedLocalSettings = localStorage.getItem("chattron-settings");
  const savedSettings =
    savedFileSettings ||
    (savedLocalSettings ? JSON.parse(savedLocalSettings) : null);

  providerSelect.addEventListener("change", () => {
    const provider = providerSelect.value;

    if (provider in providerConfigs) {
      const { models } = providerConfigs[provider];

      if (provider === "custom") {
        modelSelect.classList.add("hidden");
        customModelInput.classList.remove("hidden");

        // 유지: 기존 값 복원
        customModelInput.value = savedSettings?.modelName || "";
        apiUrlInput.value = savedSettings?.apiUrl || "";
      } else {
        modelSelect.classList.remove("hidden");
        customModelInput.classList.add("hidden");

        modelSelect.innerHTML = '<option value="">Select Model</option>';
        models.forEach((model) => {
          const option = document.createElement("option");
          option.value = model.name;
          option.textContent = model.name;
          option.dataset.url = model.url;
          modelSelect.appendChild(option);
        });

        if (pendingModelToSelect) {
          const targetOption = [...modelSelect.options].find(
            (o) => o.value === pendingModelToSelect
          );
          if (targetOption) {
            modelSelect.value = targetOption.value;
            apiUrlInput.value = targetOption.dataset.url;
          }
          pendingModelToSelect = null;
        } else if (models.length > 0) {
          modelSelect.selectedIndex = 1;
          apiUrlInput.value = models[0].url;
        }
      }
    } else {
      apiUrlInput.value = "";
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      modelSelect.classList.remove("hidden");
      customModelInput.classList.add("hidden");
    }
  });

  modelSelect.addEventListener("change", () => {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const selectedUrl = selectedOption.dataset.url;
    if (selectedUrl) {
      apiUrlInput.value = selectedUrl;
    }
  });

  saveBtn.addEventListener("click", () => {
    const provider = providerSelect.value;
    const apiUrl = apiUrlInput.value.trim();
    const modelName = modelSelect.classList.contains("hidden")
      ? customModelInput.value.trim()
      : modelSelect.value.trim();
    const apiKey = document.getElementById("api-key").value.trim();

    if (!apiUrl || !modelName) {
      alert("Please enter both API URL and model name.");
      return;
    }

    const settings = {
      provider,
      apiUrl,
      modelName,
      apiKey,
    };

    localStorage.setItem("chattron-settings", JSON.stringify(settings));
    if (window.settingsAPI) {
      window.settingsAPI.save(settings);
    }

    window.location.href = "index.html";
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  if (savedSettings) {
    const { provider, apiUrl, modelName, apiKey } = savedSettings;
    providerSelect.value = provider || "";
    apiUrlInput.value = apiUrl || "";
    if (apiKey) document.getElementById("api-key").value = apiKey;

    providerSelect.dispatchEvent(new Event("change"));

    if (provider === "custom") {
      customModelInput.value = modelName;
    } else {
      pendingModelToSelect = modelName;
    }
  }
});
