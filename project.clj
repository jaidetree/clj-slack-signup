(defproject slack-signup "1.0.0-SNAPSHOT"
  :description "Clojure-based slack signup app"
  :url "https://boiling-hollows-52817.herokuapp.com/"
  :license {:name "BSD-3-Clause"
            :url "https://tldrlegal.com/license/bsd-3-clause-license-(revised)"}
  :dependencies [[org.clojure/clojure "1.9.0"]
                 [compojure "1.6.1"]
                 [ring/ring-jetty-adapter "1.6.3"]
                 [ring/ring-json "0.4.0"]
                 [environ "1.1.0"]
                 [clj-http "3.9.1"]
                 [cheshire "5.8.0"]]
  :min-lein-version "2.8.1"
  :plugins [[lein-environ "1.1.0"]]
  :hooks [environ.leiningen.hooks]
  :uberjar-name "slack-signup.jar"
  :profiles {:production {:env {:production true}}})
