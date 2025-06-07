document.addEventListener("DOMContentLoaded", () => {
  // Get references to all input elements
  const providerSelect = document.getElementById("provider");
  const apiUrlInput = document.getElementById("api-url");
  const modelSelect = document.getElementById("model-name");
  const customModelInput = document.getElementById("custom-model-name");
  const saveBtn = document.getElementById("save-btn");
  const backBtn = document.getElementById("back-btn");

  // Define supported providers and their corresponding models and API URLs
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
      models: [], // No predefined models for custom provider
    },
  };

  let pendingModelToSelect = null; // Used to defer model selection after provider changes

  // Load saved settings from either settingsAPI or localStorage
  const savedFileSettings = window.settingsAPI?.load?.();
  const savedLocalSettings = localStorage.getItem("chattron-settings");
  const savedSettings =
    savedFileSettings ||
    (savedLocalSettings ? JSON.parse(savedLocalSettings) : null);

  // Event: When provider changes → update model options and API URL
  providerSelect.addEventListener("change", () => {
    const provider = providerSelect.value;

    if (provider in providerConfigs) {
      const { models } = providerConfigs[provider];

      if (provider === "custom") {
        // Show custom model input, hide dropdown
        modelSelect.classList.add("hidden");
        customModelInput.classList.remove("hidden");

        // Restore previous values for custom provider
        customModelInput.value = savedSettings?.modelName || "";
        apiUrlInput.value = savedSettings?.apiUrl || "";
      } else {
        // Show dropdown for predefined models
        modelSelect.classList.remove("hidden");
        customModelInput.classList.add("hidden");

        // Populate model dropdown
        modelSelect.innerHTML = '<option value="">Select Model</option>';
        models.forEach((model) => {
          const option = document.createElement("option");
          option.value = model.name;
          option.textContent = model.name;
          option.dataset.url = model.url;
          modelSelect.appendChild(option);
        });

        // If previously selected model exists → restore it
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
          // Default to first model
          modelSelect.selectedIndex = 1;
          apiUrlInput.value = models[0].url;
        }
      }
    } else {
      // Unknown provider fallback (clear input fields)
      apiUrlInput.value = "";
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      modelSelect.classList.remove("hidden");
      customModelInput.classList.add("hidden");
    }
  });

  // Event: When model changes → update API URL input
  modelSelect.addEventListener("change", () => {
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const selectedUrl = selectedOption.dataset.url;
    if (selectedUrl) {
      apiUrlInput.value = selectedUrl;
    }
  });

  // Event: Save button → persist settings and go back to index.html
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

    // Save to localStorage and optionally to file system
    localStorage.setItem("chattron-settings", JSON.stringify(settings));
    if (window.settingsAPI) {
      window.settingsAPI.save(settings);
    }

    // Redirect to main page
    window.location.href = "index.html";
  });

  // Event: Back button → return to main page
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // Initialize form with previously saved settings
  if (savedSettings) {
    const { provider, apiUrl, modelName, apiKey } = savedSettings;
    providerSelect.value = provider || "";
    apiUrlInput.value = apiUrl || "";
    if (apiKey) document.getElementById("api-key").value = apiKey;

    // Trigger provider change to update model list
    providerSelect.dispatchEvent(new Event("change"));

    if (provider === "custom") {
      // Directly restore custom model name
      customModelInput.value = modelName;
    } else {
      // Defer selection of model after model list is populated
      pendingModelToSelect = modelName;
    }
  }
});
