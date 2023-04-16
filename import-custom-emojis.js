const request = require("request");
const yaml = require("js-yaml");
const readline = require("readline");

require("dotenv").config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const rocketchatServerUrl = process.env.ROCKETCHAT_SERVER_URL || "";
const adminUsername = process.env.ADMIN_USERNAME || "";
const adminPassword = process.env.ADMIN_PASSWORD || "";

function promptForValue(message, currentValue, callback) {
  if (currentValue) {
    callback(currentValue);
  } else {
    rl.question(message, (value) => {
      callback(value);
    });
  }
}

function fetchExistingEmojis(authToken, userId, callback) {
  request.get(
    {
      url: `${rocketchatServerUrl}/api/v1/emoji-custom.list`,
      headers: {
        "X-Auth-Token": authToken,
        "X-User-Id": userId,
      },
      json: true,
    },
    (error, response, body) => {
      if (error) {
        console.error("Error fetching existing emojis:", error);
        return;
      }

      const existingEmojiNames = body.emojis ? body.emojis.update.map((emoji) => emoji.name) : [];
      callback(existingEmojiNames);
    }
  );
}

promptForValue("URL for YAML file? ", "", (emojiYamlUrl) => {
  promptForValue("Rocket.Chat server URL? ", rocketchatServerUrl, (finalRocketchatServerUrl) => {
    promptForValue("Rocket.Chat admin username? ", adminUsername, (finalAdminUsername) => {
      promptForValue("Rocket.Chat admin password? ", adminPassword, (finalAdminPassword) => {
        rl.close();

        // Login to Rocket.Chat
        request.post(
          {
            url: `${rocketchatServerUrl}/api/v1/login`,
            json: {
              user: adminUsername,
              password: adminPassword,
            },
          },
          (loginError, loginResponse, loginBody) => {
            if (loginError || !loginBody.data) {
              console.error("Error logging in:", loginError || loginBody.message);
              return;
            }

            const authToken = loginBody.data.authToken;
            const userId = loginBody.data.userId;

            fetchExistingEmojis(authToken, userId, (existingEmojiNames) => {
              request(emojiYamlUrl, (error, response, body) => {
                if (error) {
                  console.error("Error fetching YAML:", error);
                  return;
                }

                const emojiYaml = yaml.load(body);
                const emojis = emojiYaml["emojis"];

                let uploadedEmojisCount = 0;

                for (const emoji of emojis) {
                  const url = emoji.src;
                  const file = url.split("/").pop();
                  const [name, ext] = file.split(".");

                  if (existingEmojiNames.includes(name)) {
                    console.log(`Emoji ${name} already exists, skipping upload`);
                    continue;
                  }

                  request.get(url, { encoding: null }, (imageError, imageResponse, imageData) => {
                    if (imageError) {
                      console.error("Error downloading image:", imageError);
                      return;
                    }

                    request.post(
                      {
                        url: `${rocketchatServerUrl}/api/v1/emoji-custom.create`,
                        headers: {
                          "X-Auth-Token": authToken,
                          "X-User-Id": userId,
                        },
                        formData: {
                          name: emoji.name,
                          aliases: "",
                          emoji: {
                            value: imageData,
                            options: {
                              filename: `${name}.${ext}`,
                              contentType: `image/${ext}`,
                            },
                          },
                        },
                      },
                      (uploadError, uploadResponse, uploadBody) => {
                        if (uploadError) {
                          console.error("Error uploading emoji:" + emoji.name + " - Error: ", uploadError);
                          return;
                        }

                        const uploadResponseBody = JSON.parse(uploadBody);

                        if (!uploadResponseBody.success) {
                          console.error("Error uploading emoji: " + emoji.name + " - Error: ", uploadResponseBody.error);
                          return;
                        }

                        console.log(`Successfully added a new emoji: ${emoji.name}`);

                        uploadedEmojisCount++;

                        if (uploadedEmojisCount === emojis.length) {
                          console.log(`Successfully added ${uploadedEmojisCount} new emojis`);
                        }
                      }
                    );
                  });
                }
              });
            });
          }
        );
      });
    });
  });
});
