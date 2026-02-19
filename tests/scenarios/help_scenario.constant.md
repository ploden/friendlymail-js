Scenario: The host user sends the help command

Step 1: The MessageStore is empty. No friendlymail account exists.
Step 2: The host user sends the following message:
```
From: <host>
Subject: Fm
Date: <now>
To: <host>

$ help

```

Result: friendlymail replies with the following message:
```
From: <host>
Subject: Fm
Date: <now>
To: <host>

$ help
friendlymail: friendlymail, version 0.0.1
These shell commands are defined internally.  Type `$ help' to see this list.
Type `$ help adduser' to find out more about the function `adduser'.

$ help: mailto:phil@test.com?subject=Fm&body=%24%20help
$ adduser: mailto:phil@test.com?subject=Fm&body=%24%20adduser
$ help adduser: mailto:phil@test.com?subject=Fm&body=%24%20help%20adduser
$ invite: mailto:phil@test.com?subject=Fm&body=%24%20invite
$ help invite: mailto:phil@test.com?subject=Fm&body=%24%20help%20invite
$ follow: mailto:phil@test.com?subject=Fm&body=%24%20follow
$ help follow: mailto:phil@test.com?subject=Fm&body=%24%20help%20follow

friendlymail, an open-source, email-based, alternative social network

```
