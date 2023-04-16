const request = require("request");
const yaml = require("js-yaml");
const fs = require("fs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("URL for YAML file? ", (emojiYamlUrl) => {
  rl.question("Rocket.Chat server URL? ", (rocketchatServerUrl) => {
    rl.question("Rocket.Chat admin username? ", (adminUsername) => {
      rl.question("Rocket.Chat admin password? ", (adminPassword) => {
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
                        name,
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
                        console.error("Error uploading emoji:", uploadError);
                        return;
                      }

                      const uploadResponseBody = JSON.parse(uploadBody);

                      if (!uploadResponseBody.success) {
                        console.error("Error uploading emoji:", uploadResponseBody.error);
                        return;
                      }

                      uploadedEmojisCount++;

                      if (uploadedEmojisCount === emojis.length) {
                        console.log(`Successfully added ${uploadedEmojisCount} new emojis`);
                      }
                    }
                  );
                });
              }
            });
          }
        );
      });
    });
  });
});
