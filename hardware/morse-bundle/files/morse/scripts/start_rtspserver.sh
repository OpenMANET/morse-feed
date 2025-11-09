
#start rtsp server
v4l2rtspserver -I 10.42.1.1 -u morse -Q5 -G 640x480x25 /dev/video0

#can be played with mpv. 
#mpv --profile=low-latency --stream-buffer-size=524288 rtsp://10.42.1.1:8554/morse

#disable cache, near real-time but not as resilient to network drops
#mpv --untimed --no-cache --cache-secs=0 --demuxer-readahead-secs=0 --profile=low-latency  rtsp://10.42.1.1:8554/morse
