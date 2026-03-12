+++
date = "2020-05-04T00:53:00-04:00"
title = "Raspberry Pi k3s Cluster"
author = "khayyam"
draft = true
+++

The Raspberry Pi is a super cheap micro-computer on the ARM architecture that can run Linux!

Because it's so cheap, and Kubernetes is so expensive, it makes a great platform to deploy Kubernetes on!

Rancher labs came up with a lightweight, stripped down implementation of the Kubernetes API called `k3s`, and with a little help from k3sup, I had a 3-node cluster up and ready in no time. In this post, I'll detail what it took to fire up this glamorous setup and show you how to deploy some services as well.
