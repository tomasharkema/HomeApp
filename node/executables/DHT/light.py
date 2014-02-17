#!/usr/bin/env python
import serial
import requests
import time

ser = serial.Serial('/dev/ttyACM0', 9600)
while True:
        temp =  ser.readline()
        temp = temp.rstrip()

        print("http://home.tomasharkema.nl/light/"+temp+"/")
        r = requests.get("http://home.tomasharkema.nl/light/"+temp+"/")

        time.sleep(10)