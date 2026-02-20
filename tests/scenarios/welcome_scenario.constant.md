Scenario: friendlymail is run for the first time

Step 1: The Daemon runs for the first time. A TestMessageProvider is used to send and receive messages. After checking for messages, MessageStore contains no friendlymail messages.

Result: A message draft containing the message below is created by the MessageProcessor. The TestMessageProvider sends the draft, resulting in the message being removed from drafts and appearing in allMessages of the MessageStore.
```
From: <host>
Subject: Welcome to friendlymail!
Date: <now>
To: <host>

   __      _                _ _                       _ _
  / _|    (_)              | | |                     (_) |
 | |_ _ __ _  ___ _ __   __| | |_   _ _ __ ___   __ _ _| |
 |  _| '__| |/ _ \ '_ \ / _` | | | | | '_ ` _ \ / _` | | |
 | | | |  | |  __/ | | | (_| | | |_| | | | | | | (_| | | |
 |_| |_|  |_|\___|_| |_|\__,_|_|\__, |_| |_| |_|\__,_|_|_|
                                 __/ |
                                |___/
friendlymail 0.0.1
Reply to this message with "$ help" for more information.

help: mailto:phil@test.com?subject=Fm&body=%24%20help

friendlymail, an open-source, email-based, alternative social network
```
