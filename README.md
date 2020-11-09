# fluttershy-face2face
This is a repository for the P2P course, which aims to implement WebRTC and some P2P architecture to create a collaborative video conference application.

# Priority (main features)
- Implement file sharing system
    - Display Shared files (immutable)
    - Download link shows up in chatlogs
- Chat system

- Tracking of network activity for topology / visual representation of network for debugging/presentation (graph)

- Support new p2p topologies
    - Mixer election protocol
        - 
    - Find a way to establish 'strong' clients from 'weak' clients

- Use auto-merge library to have collabarative text editing

# Nice-to-have
- Implement https
    - Needs certificate to function, only possible when server is live
    - Test system with multiple users    
- Database for storing chatlogs
- Screenshare feature
- Homework feature 
    - Shared todo list
- Meeting schedule
    - What do we do in this meeting?
    - Or, timed notifications for meeting startup
- Screenshare feature
- Stream local video to group/call

- Nice to have chat commands

# Done 
- Need new main page
    - Join group chat by ID
        - Optionally with password for room
- Support multiple different callers at once.
- Make groups
    - Share links to groups
    - Set password to group?
    
- (Support new p2p topologies)
    - Find a way to mash video streams together (video)
    - Find a way to mash video streams together (audio)


- Display different tabs with content for all users
    - Tabs include images, or simple display files
      
# Interesting Links
- (For text editing) https://blog.datproject.org/2019/03/05/caracara-react-dat-automerge/
- https://users-cs.au.dk/bouvin/dBIoTP2PC/2020/projects/#panzoom
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
