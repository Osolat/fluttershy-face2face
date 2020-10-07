# fluttershy-face2face
This is a repository for the P2P course, which aims to implement WebRTC and some P2P architecture to create a collaborative video conference application.

# TODO
- Need new main page
    - Join group chat by ID
        - Optionally with password for room
- Implement https
    - Needs certificate to function, only possible when server is live
    - Test system with multiple users
- Support multiple different callers at once.
- Implement file sharing system
- Chat system
- Database for storing chatlogs
- Make groups
    - Share links to groups
    - Set password to group?
- Screenshare feature
- Homework feature 
    - Shared todo list
- Meeting schedule
    - What do we do in this meeting?
    - Or, timed notifications for meeting startup
- Screenshare feature
- Stream local video to group/call

# Interesting Links
- https://letsencrypt.org/
    - for certificates etc
- https://developers.google.com/web/tools/puppeteer/
    - for site testing
- https://alexei-led.github.io/post/pumba_docker_chaos_testing/
    - for for testing networks inside docker
- https://peertube.dk/
- https://news.ycombinator.com/item?id=23398261
- https://webtorrent.io/
- https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/multiple/js/main.js
    - For multiple streams. Mesh style.